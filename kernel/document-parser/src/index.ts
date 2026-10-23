// Structured document ingestion with explicit format and preservation limits.
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { validate, SCHEMA_IDS, loadAllSchemas } from '@pres/schema-validator';
import {
  DocumentFormat,
  DocumentIR,
  ParsedDocument,
  ExtractedFact,
  Block,
} from './types.js';
import { parseMarkdown } from './parsers/markdown.js';
import { parsePlaintext } from './parsers/plaintext.js';
import { parseTabular } from './parsers/tabular.js';
import { parseDocx } from './parsers/docx.js';
import { parseXlsx } from './parsers/xlsx.js';
import { extractFacts, verifyFactsPreserved } from './fact-extractor.js';

export * from './types.js';
export { extractFacts, verifyFactsPreserved } from './fact-extractor.js';
export { extractZipEntries } from './zip.js';

export const SUPPORTED_DOCUMENT_FORMATS = ['markdown', 'plaintext', 'csv', 'tsv', 'docx', 'xlsx'] as const;
export class UnsupportedDocumentFormatError extends Error {
  readonly code = 'UNSUPPORTED_DOCUMENT_FORMAT';
  constructor(readonly format: string) {
    super(`Unsupported document format: ${format}. Supported ingestion formats: ${SUPPORTED_DOCUMENT_FORMATS.join(', ')}`);
    this.name = 'UnsupportedDocumentFormatError';
  }
}

function decodeText(buffer: Buffer): string {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new Error('Document text must be valid UTF-8; binary input cannot be parsed as plaintext'); }
  if (text.includes('\u0000') || text.startsWith('%PDF-') || buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('Binary document cannot be parsed as UTF-8 plaintext');
  return text;
}

function documentText(doc: DocumentIR): string {
  return doc.blocks.map(block => {
    switch (block.type) {
      case 'heading': case 'paragraph': return block.text;
      case 'list': return block.items.join('\n');
      case 'table': return [block.headers, ...block.rows].map(row => row.join('\t')).join('\n');
      case 'code': return block.code;
      case 'image': return block.caption;
    }
  }).join('\n');
}

let schemasEnsured = false;
async function ensureSchemas(): Promise<void> {
  if (!schemasEnsured) {
    await loadAllSchemas();
    schemasEnsured = true;
  }
}

export function detectFormat(filename: string, content?: string | Buffer): DocumentFormat {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case '.md':
    case '.markdown':
      return 'markdown';
    case '.txt':
      return 'plaintext';
    case '.csv':
      return 'csv';
    case '.tsv':
      return 'tsv';
    case '.docx':
      return 'docx';
    case '.xlsx':
      return 'xlsx';
    case '.pdf':
      return 'pdf';
    case '.pptx':
      return 'pptx';
    default:
      if (typeof content === 'string') {
        if (content.includes('# ') || content.includes('## ') || content.includes('|')) return 'markdown';
        if (content.includes('\t')) return 'tsv';
        if (content.includes(',')) return 'csv';
      }
      return 'plaintext';
  }
}

export async function parseDocument(
  content: string | Buffer,
  filename: string,
  format?: DocumentFormat
): Promise<ParsedDocument> {
  const detected = format ?? detectFormat(filename, content);
  if (!(SUPPORTED_DOCUMENT_FORMATS as readonly string[]).includes(detected)) throw new UnsupportedDocumentFormatError(detected);
  await ensureSchemas();
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  let parseResult: { doc: DocumentIR; facts: ExtractedFact[] };

  switch (detected) {
    case 'markdown':
      parseResult = parseMarkdown(decodeText(buffer), filename);
      break;
    case 'plaintext':
      parseResult = parsePlaintext(decodeText(buffer), filename);
      break;
    case 'csv':
      parseResult = parseTabular(decodeText(buffer), 'csv', filename);
      break;
    case 'tsv':
      parseResult = parseTabular(decodeText(buffer), 'tsv', filename);
      break;
    case 'docx':
      parseResult = parseDocx(buffer, filename);
      break;
    case 'xlsx':
      parseResult = parseXlsx(buffer, filename);
      break;
    default:
      throw new UnsupportedDocumentFormatError(detected);
  }

  // Schema validation against DocumentIR
  const val = validate(SCHEMA_IDS.documentIr, parseResult.doc);
  if (!val.valid) {
    throw new Error(`Parsed DocumentIR failed schema validation: ${val.errors.join('; ')}`);
  }

  // Generate aggregate statistics
  let headingsCount = 0;
  let tablesCount = 0;
  for (const b of parseResult.doc.blocks) {
    if (b.type === 'heading') headingsCount++;
    if (b.type === 'table') tablesCount++;
  }

  return {
    doc: parseResult.doc,
    facts: parseResult.facts,
    rawText: detected === 'docx' || detected === 'xlsx' ? documentText(parseResult.doc) : decodeText(buffer),
    sha256,
    summary: {
      totalBlocks: parseResult.doc.blocks.length,
      totalFacts: parseResult.facts.length,
      headingsCount,
      tablesCount,
    },
  };
}

/**
 * Maps supported text/list/table blocks to DeckSpec; it is not a factual-truth certificate.
 */
export function documentIrToDeck(
  doc: DocumentIR,
  defaultTitle?: string
): {
  schema: 'deck-spec';
  version: '1';
  title: string;
  slides: Array<{
    id: string;
    kind: string;
    title: string;
    layout: any;
    blocks: any[];
    notes?: string;
  }>;
} {
  let title = defaultTitle ?? 'Presentation Deck';
  const slides: Array<{
    id: string;
    kind: string;
    title: string;
    layout: any;
    blocks: any[];
    notes?: string;
  }> = [];

  let currentSlide: {
    id: string;
    kind: string;
    title: string;
    layout: any;
    blocks: any[];
  } | null = null;

  for (const block of doc.blocks) {
    if (block.type === 'heading') {
      if (block.level === 1 && !currentSlide && slides.length === 0) {
        // Document main title
        title = block.text;
        currentSlide = {
          id: `slide-1`,
          kind: 'cover',
          title: block.text,
          layout: { schema: 'layout-ir', version: '1', width: 13.333, height: 7.5, children: [] },
          blocks: [{ type: 'text', text: block.text }],
        };
        slides.push(currentSlide);
      } else {
        // New section / content slide
        const nextId = `slide-${slides.length + 1}`;
        currentSlide = {
          id: nextId,
          kind: block.level === 1 ? 'cover' : 'content',
          title: block.text,
          layout: { schema: 'layout-ir', version: '1', width: 13.333, height: 7.5, children: [] },
          blocks: [],
        };
        slides.push(currentSlide);
      }
    } else if (block.type === 'paragraph') {
      if (!currentSlide) {
        currentSlide = {
          id: 'slide-1',
          kind: 'content',
          title: '概述',
          layout: { schema: 'layout-ir', version: '1', width: 13.333, height: 7.5, children: [] },
          blocks: [],
        };
        slides.push(currentSlide);
      }
      currentSlide.blocks.push({ type: 'text', text: block.text });
    } else if (block.type === 'list') {
      if (!currentSlide) {
        currentSlide = {
          id: 'slide-1',
          kind: 'content',
          title: '要点',
          layout: { schema: 'layout-ir', version: '1', width: 13.333, height: 7.5, children: [] },
          blocks: [],
        };
        slides.push(currentSlide);
      }
      for (const item of block.items) {
        currentSlide.blocks.push({ type: 'text', text: item });
      }
    } else if (block.type === 'table') {
      if (!currentSlide) {
        currentSlide = {
          id: `slide-${slides.length + 1}`,
          kind: 'data',
          title: '数据统计',
          layout: { schema: 'layout-ir', version: '1', width: 13.333, height: 7.5, children: [] },
          blocks: [],
        };
        slides.push(currentSlide);
      }
      currentSlide.blocks.push({
        type: 'table',
        headers: block.headers,
        rows: block.rows,
      });
    }
  }

  if (slides.length === 0) {
    slides.push({
      id: 'slide-1',
      kind: 'cover',
      title,
      layout: { schema: 'layout-ir', version: '1', width: 13.333, height: 7.5, children: [] },
      blocks: [{ type: 'text', text: title }],
    });
  }

  return {
    schema: 'deck-spec',
    version: '1',
    title,
    slides,
  };
}
