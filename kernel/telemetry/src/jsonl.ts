// JSONL append-only writer（总方案 PHASE 19）
// 存储：D:\PresentationOSData\logs\YYYY-MM-DD.jsonl
// 规则：append-only；禁止静默覆盖/删除；写盘前脱敏。

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CanonicalEvent } from './events.js';
import { sanitizeForLog } from './redact.js';

export interface JsonlWriterOptions {
  logDir?: string;
  appVersion?: string;
  gitCommit?: string;
}

export class JsonlLogWriter {
  private readonly logDir: string;
  private readonly appVersion?: string;
  private readonly gitCommit?: string;
  private currentDay: string;
  private currentPath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(opts: JsonlWriterOptions = {}) {
    this.logDir = opts.logDir ?? process.env.PRES_LOG_DIR ?? 'D:\\PresentationOSData\\logs';
    this.appVersion = opts.appVersion;
    this.gitCommit = opts.gitCommit;
    const now = new Date();
    this.currentDay = this.dayKey(now);
    this.currentPath = join(this.logDir, `${this.currentDay}.jsonl`);
  }

  private dayKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.logDir, { recursive: true });
  }

  async write(event: CanonicalEvent): Promise<void> {
    const now = new Date();
    const day = this.dayKey(now);
    if (day !== this.currentDay) {
      this.currentDay = day;
      this.currentPath = join(this.logDir, `${day}.jsonl`);
    }
    const safe = sanitizeForLog(event) as Record<string, unknown>;
    const line = JSON.stringify({ ...safe, app_version: safe.app_version ?? this.appVersion, git_commit: safe.git_commit ?? this.gitCommit });
    // 串行化写盘（单写者保证，避免交错/半行）
    this.writeChain = this.writeChain.then(async () => {
      await this.ensureDir();
      await appendFile(this.currentPath, line + '\n', 'utf8');
    });
    await this.writeChain;
  }

  /** 当前日志文件路径（供 UI/CLI 打开日志目录） */
  getCurrentLogPath(): string {
    return this.currentPath;
  }

  getLogDir(): string {
    return this.logDir;
  }
}
