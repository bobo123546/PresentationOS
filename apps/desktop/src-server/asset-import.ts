import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { parseDocument, type Block, type DocumentIR } from '@pres/document-parser';
import { extractTemplateDna, designTokensFromDna } from '@pres/template-dna';
import type { PresentationProject } from '@pres/workflow';
import { DataPaths } from './local-paths.js';

export const MAX_IMPORT_BYTES = 16 * 1024 * 1024;
const DOCUMENT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.docx', '.csv', '.tsv', '.xlsx']);
export type ImportKind = 'document' | 'reference-template';
export interface ImportedAsset { path: string; sha256: string; filename: string; }
export const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** JSON base64 must be canonical; Buffer.from alone silently accepts malformed input. */
export function decodeImportBase64(value: unknown): Buffer {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0 || value.length > Math.ceil(MAX_IMPORT_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('A nonempty canonical base64 document of at most 16 MiB is required');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_IMPORT_BYTES || bytes.toString('base64') !== value) throw new Error('Invalid base64 or import exceeds the 16 MiB limit');
  return bytes;
}

function checkedFilename(value: unknown, kind: ImportKind): string {
  if (typeof value !== 'string' || !value.length || value.length > 240 || value !== basename(value) ||
      /[\\/:\x00-\x1f]/.test(value) || /[. ]$/.test(value) || /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(value)) {
    throw new Error('Import filename must be a plain filename without paths, streams or device aliases');
  }
  const ext = extname(value).toLowerCase();
  if (kind === 'reference-template' ? ext !== '.pptx' : !DOCUMENT_EXTENSIONS.has(ext)) {
    throw new Error(kind === 'reference-template' ? 'Reference template must be a .pptx file' : 'Supported document files: .md, .markdown, .txt, .docx, .csv, .tsv and .xlsx');
  }
  return value;
}

const blockValue = (block: Block): unknown => {
  const { facts: _facts, ...value } = block as Block & { facts?: unknown };
  return value;
};

/** Refuse editable conversions whose parser round-trip changes a source block or cell. */
async function editableMarkdown(doc: DocumentIR): Promise<string> {
  const markdown = doc.blocks.map(block => {
    switch (block.type) {
      case 'heading': return `${'#'.repeat(block.level)} ${block.text}`;
      case 'paragraph': return block.text;
      case 'list': return block.items.map((text, index) => `${block.ordered ? `${index + 1}.` : '-'} ${text}`).join('\n');
      case 'table': return [block.headers, block.headers.map(() => '---'), ...block.rows].map(row => `|${row.join('|')}|`).join('\n');
      default: throw new Error(`Cannot import ${block.type} into the Markdown editor without loss; a dedicated editor adapter is required`);
    }
  }).join('\n\n');
  const reparsed = await parseDocument(markdown, 'editable.md');
  if (JSON.stringify(reparsed.doc.blocks.map(blockValue)) !== JSON.stringify(doc.blocks.map(blockValue))) {
    throw new Error('Cannot import this document into the Markdown editor without changing block text, significant whitespace or table cells; no asset was imported');
  }
  return markdown;
}

export async function inspectDocument(bytes: Buffer, filename: string): Promise<{ markdown: string; format: string; scope: string }> {
  const parsed = await parseDocument(bytes, filename);
  if (!parsed.doc.blocks.length) throw new Error('Document has no editable body content');
  const markdown = parsed.doc.sourceType === 'markdown' ? parsed.rawText : await editableMarkdown(parsed.doc);
  return { markdown, format: parsed.doc.sourceType,
    scope: 'Body text and cached table values; document styling, embedded assets and formula evaluation are not reproduced' };
}

export async function importAsset(paths: DataPaths, body: Record<string, unknown>): Promise<{
  asset: ImportedAsset; markdown?: string; format?: string; scope: string; warnings?: string[];
}> {
  if (body.kind !== 'document' && body.kind !== 'reference-template') throw new Error('Import kind must be document or reference-template');
  const kind = body.kind, filename = checkedFilename(body.filename, kind), bytes = decodeImportBase64(body.base64);
  let details: { markdown?: string; format?: string; scope: string; warnings?: string[] };
  if (kind === 'document') details = await inspectDocument(bytes, filename);
  else {
    const dna = await extractTemplateDna(bytes, filename);
    // Exercise normalization before accepting a reference. It is not a layout or asset import.
    designTokensFromDna(dna);
    details = { scope: 'theme-colors-and-fonts', warnings: dna.warnings };
  }
  const hash = sha256(bytes), path = paths.file(join('imports', kind, `${hash}${extname(filename).toLowerCase()}`));
  mkdirSync(dirname(path), { recursive: true });
  paths.file(path);
  try { writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  paths.file(path);
  if (!lstatSync(path).isFile() || sha256(readFileSync(path)) !== hash) throw new Error('Stored import is not the expected content-addressed regular file');
  return { asset: { path, sha256: hash, filename }, ...details };
}

/** Profiles only refer to validated, content-addressed assets in this desktop data root. */
export function validateAsset(paths: DataPaths, asset: unknown, kind: ImportKind): ImportedAsset {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) throw new Error(`Missing ${kind} asset descriptor`);
  const candidate = asset as Record<string, unknown>, filename = checkedFilename(candidate.filename, kind);
  if (typeof candidate.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.sha256)) throw new Error('Asset SHA-256 must be 64 lowercase hexadecimal characters');
  const path = paths.file(candidate.path), expected = join('imports', kind, `${candidate.sha256}${extname(filename).toLowerCase()}`);
  if (relative(paths.root, path) !== expected || !existsSync(path) || !lstatSync(path).isFile()) throw new Error('Asset must be an existing imported regular file in the selected data directory');
  if (lstatSync(path).size > MAX_IMPORT_BYTES) throw new Error('Imported asset exceeds the 16 MiB limit');
  if (sha256(readFileSync(path)) !== candidate.sha256) throw new Error('Imported asset bytes no longer match the recorded SHA-256');
  return { path, sha256: candidate.sha256, filename };
}

export function validateCompileAsset(paths: DataPaths, path: unknown, hash: unknown, kind: ImportKind): string {
  const safePath = paths.file(path), extension = extname(safePath).toLowerCase();
  // The original display filename is not required for compilation; its extension is.
  return validateAsset(paths, { path: safePath, sha256: hash, filename: `source${extension}` }, kind).path;
}

export async function validateProjectAssets(paths: DataPaths, project: PresentationProject): Promise<void> {
  const profile = project.compileProfile;
  if (!profile) return;
  if (project.version !== '1.1.0') throw new Error('compileProfile requires project version 1.1.0');
  if (profile.sourceAsset) {
    const source = validateAsset(paths, profile.sourceAsset, 'document');
    const { markdown } = await inspectDocument(readFileSync(source.path), source.filename);
    if (profile.sourceAsset.markdownSha256 !== sha256(markdown) || profile.sourceAsset.markdownSha256 !== sha256(project.sourceDocument.content)) {
      throw new Error('Source binding does not match the imported editable Markdown; clear sourceAsset after editing');
    }
  }
  if (profile.referenceAsset) validateAsset(paths, profile.referenceAsset, 'reference-template');
}
