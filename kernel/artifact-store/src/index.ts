// Artifact Store（总方案 PHASE 5）
// 内容寻址存储：写入返回 artifactRef；按 SHA256 存储，去重，附元数据索引。
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync, appendFileSync } from 'node:fs';
import { join, extname } from 'node:path';

export interface ArtifactMeta {
  ref: string;
  sha256: string;
  size: number;
  contentType: string;
  originalName: string;
  createdAt: string;
  workflowRunId?: string;
  capabilityId?: string;
  traceId?: string;
  [k: string]: unknown;
}

export interface ArtifactRecord {
  meta: ArtifactMeta;
  path: string;
}

export class ArtifactStore {
  private readonly root: string;
  private readonly indexFile: string;
  private index: Map<string, ArtifactMeta>;

  constructor(root: string) {
    this.root = root;
    this.indexFile = join(root, 'index.jsonl');
    this.index = new Map();
    mkdirSync(join(root, 'blobs'), { recursive: true });
    this.loadIndex();
  }

  private loadIndex(): void {
    if (!existsSync(this.indexFile)) return;
    try {
      const text = readFileSync(this.indexFile, 'utf8');
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          const m = JSON.parse(t) as ArtifactMeta;
          this.index.set(m.ref, m);
        } catch { /* skip corrupt line */ }
      }
    } catch { /* skip */ }
  }

  private blobPath(sha256: string): string {
    return join(this.root, 'blobs', sha256.slice(0, 2), sha256);
  }

  /** 写入字节；内容相同（同 sha256）返回已有 ref（去重） */
  put(data: Buffer | string, opts: { originalName?: string; contentType?: string; workflowRunId?: string; capabilityId?: string; traceId?: string } = {}): ArtifactMeta {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const ref = `sha256:${sha256}`;
    const existing = this.index.get(ref);
    if (existing) return existing;
    const meta: ArtifactMeta = {
      ref,
      sha256,
      size: buf.length,
      contentType: opts.contentType ?? 'application/octet-stream',
      originalName: opts.originalName ?? '',
      createdAt: new Date().toISOString(),
      workflowRunId: opts.workflowRunId,
      capabilityId: opts.capabilityId,
      traceId: opts.traceId,
    };
    const p = this.blobPath(sha256);
    if (!existsSync(p)) {
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, buf);
    }
    this.index.set(ref, meta);
    this.appendIndex(meta);
    return meta;
  }

  private appendIndex(meta: ArtifactMeta): void {
    // append-only；不重写整个 index
    appendFileSync(this.indexFile, JSON.stringify(meta) + '\n', 'utf8');
  }

  get(ref: string): ArtifactRecord | null {
    const meta = this.index.get(ref);
    if (!meta) return null;
    return { meta, path: this.blobPath(meta.sha256) };
  }

  read(ref: string): Buffer | null {
    const rec = this.get(ref);
    if (!rec || !existsSync(rec.path)) return null;
    return readFileSync(rec.path);
  }

  list(filter?: { capabilityId?: string; workflowRunId?: string }): ArtifactMeta[] {
    let all = [...this.index.values()];
    if (filter?.capabilityId) all = all.filter((m) => m.capabilityId === filter.capabilityId);
    if (filter?.workflowRunId) all = all.filter((m) => m.workflowRunId === filter.workflowRunId);
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** 目录总大小（blobs） */
  totalBytes(): number {
    let sum = 0;
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else sum += statSync(p).size;
      }
    };
    walk(join(this.root, 'blobs'));
    return sum;
  }

  filePathFor(ref: string): string | null {
    return this.get(ref)?.path ?? null;
  }
}

// 避免顶层 import appendFileSync 干扰；直接 require 亦可
export function artifactFileName(meta: ArtifactMeta): string {
  const ext = extname(meta.originalName || '.bin') || '.bin';
  return `${meta.sha256.slice(0, 16)}${ext}`;
}
