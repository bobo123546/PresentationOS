import type { CompileProfile, ImportedAsset } from './types.js';

export const MAX_IMPORT_BYTES = 16 * 1024 * 1024;
export type AssetKind = 'document' | 'reference-template';
export type LocalImportFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>;

export async function sha256Text(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function encodeImportFile(file: LocalImportFile, kind: AssetKind): Promise<string> {
  const allowed = kind === 'document' ? /\.(md|markdown|txt|docx|csv|tsv|xlsx)$/i : /\.pptx$/i;
  if (!allowed.test(file.name)) throw new Error(kind === 'document' ? '请选择 Markdown、TXT、DOCX、CSV、TSV 或 XLSX 文件' : '请选择 PPTX 参考文稿');
  if (file.size === 0 || file.size > MAX_IMPORT_BYTES) throw new Error('文件须非空且不超过 16 MiB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || bytes.byteLength > MAX_IMPORT_BYTES) throw new Error('读取的文件大小与所选文件不一致');
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  }
  return btoa(chunks.join(''));
}

function validateAsset(value: unknown): ImportedAsset {
  const asset = value as ImportedAsset | undefined;
  if (!asset || typeof asset.path !== 'string' || !asset.path || typeof asset.filename !== 'string' || !asset.filename
    || typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('导入资产的路径或摘要无效');
  return { path: asset.path, sha256: asset.sha256, filename: asset.filename };
}

/** Structural/hash checks supplement server-side controlled path and byte checks. */
export async function restoreCompileProfile(value: unknown, markdown: string): Promise<CompileProfile> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('项目编译配置无效');
  const input = value as CompileProfile;
  const profile: CompileProfile = {};
  if (input.sourceAsset) {
    const asset = validateAsset(input.sourceAsset);
    if (input.sourceAsset.markdownSha256 !== await sha256Text(markdown)) throw new Error('项目源文与导入文件的绑定已失效');
    profile.sourceAsset = { ...asset, markdownSha256: input.sourceAsset.markdownSha256 };
  }
  if (input.referenceAsset) profile.referenceAsset = validateAsset(input.referenceAsset);
  return profile;
}

export function importedAsset(value: unknown): ImportedAsset { return validateAsset(value); }
