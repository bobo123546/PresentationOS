// 统一日志入口：组件唯一入口，禁止直接 print/console.log 作为正式日志
// Broker 失败时允许 local spool（本版本：写盘失败时降级到临时目录并标记）

import type { CanonicalEvent, LogLevel } from './events.js';
import { createEvent } from './events.js';
import { JsonlLogWriter } from './jsonl.js';

export interface LoggerOptions {
  component: string;
  runtime?: string;
  logDir?: string;
  appVersion?: string;
  gitCommit?: string;
  sessionId?: string;
}

export class Logger {
  private readonly writer: JsonlLogWriter;
  private readonly component: string;
  private readonly runtime: string;
  private readonly appVersion?: string;
  private readonly gitCommit?: string;
  private readonly sessionId?: string;

  constructor(opts: LoggerOptions) {
    this.component = opts.component;
    this.runtime = opts.runtime ?? `node/${process.version}`;
    this.appVersion = opts.appVersion;
    this.gitCommit = opts.gitCommit;
    this.sessionId = opts.sessionId;
    this.writer = new JsonlLogWriter({ logDir: opts.logDir, appVersion: opts.appVersion, gitCommit: opts.gitCommit });
  }

  private async emit(level: LogLevel, partial: Omit<CanonicalEvent, 'event_id' | 'timestamp' | 'timezone' | 'process_id' | 'component' | 'runtime' | 'level'>): Promise<void> {
    const ev = createEvent({
      level,
      component: this.component,
      runtime: this.runtime,
      session_id: this.sessionId,
      app_version: this.appVersion,
      git_commit: this.gitCommit,
      ...partial,
    });
    try {
      await this.writer.write(ev);
    } catch (err) {
      // Log Broker 失败 → local spool（写到系统临时目录，恢复后合并）
      const spoolPath = process.env.PRES_LOG_SPOOL ?? (process.env.TEMP ?? 'C:\\Windows\\Temp') + '\\pres-spool.jsonl';
      const { appendFile } = await import('node:fs/promises');
      await appendFile(spoolPath, JSON.stringify({ ...ev, spooled: true, spool_error: String(err) }) + '\n', 'utf8').catch(() => undefined);
    }
  }

  debug(partial: LogPartial): Promise<void> { return this.emit('debug', partial); }
  info(partial: LogPartial): Promise<void> { return this.emit('info', partial); }
  warn(partial: LogPartial): Promise<void> { return this.emit('warn', partial); }
  error(partial: LogPartial): Promise<void> { return this.emit('error', partial); }
  fatal(partial: LogPartial): Promise<void> { return this.emit('fatal', partial); }

  getLogPath(): string { return this.writer.getCurrentLogPath(); }
  getLogDir(): string { return this.writer.getLogDir(); }
}

type LogPartial = Omit<CanonicalEvent, 'event_id' | 'timestamp' | 'timezone' | 'process_id' | 'component' | 'runtime' | 'level'>;

export { JsonlLogWriter } from './jsonl.js';
export { createEvent, nextEventId } from './events.js';
export { sanitizeForLog, redactString } from './redact.js';
export type { CanonicalEvent } from './events.js';
