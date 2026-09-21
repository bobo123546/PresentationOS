// 统一日志入口：组件唯一入口，禁止直接 print/console.log 作为正式日志
// Broker 失败时允许 local spool（本版本：写盘失败时降级到临时目录并标记）
import { createEvent } from './events.js';
import { JsonlLogWriter } from './jsonl.js';
export class Logger {
    writer;
    component;
    runtime;
    appVersion;
    gitCommit;
    sessionId;
    constructor(opts) {
        this.component = opts.component;
        this.runtime = opts.runtime ?? `node/${process.version}`;
        this.appVersion = opts.appVersion;
        this.gitCommit = opts.gitCommit;
        this.sessionId = opts.sessionId;
        this.writer = new JsonlLogWriter({ logDir: opts.logDir, appVersion: opts.appVersion, gitCommit: opts.gitCommit });
    }
    async emit(level, partial) {
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
        }
        catch (err) {
            // Log Broker 失败 → local spool（写到系统临时目录，恢复后合并）
            const spoolPath = process.env.PRES_LOG_SPOOL ?? (process.env.TEMP ?? 'C:\\Windows\\Temp') + '\\pres-spool.jsonl';
            const { appendFile } = await import('node:fs/promises');
            await appendFile(spoolPath, JSON.stringify({ ...ev, spooled: true, spool_error: String(err) }) + '\n', 'utf8').catch(() => undefined);
        }
    }
    debug(partial) { return this.emit('debug', partial); }
    info(partial) { return this.emit('info', partial); }
    warn(partial) { return this.emit('warn', partial); }
    error(partial) { return this.emit('error', partial); }
    fatal(partial) { return this.emit('fatal', partial); }
    getLogPath() { return this.writer.getCurrentLogPath(); }
    getLogDir() { return this.writer.getLogDir(); }
}
export { JsonlLogWriter } from './jsonl.js';
export { createEvent, nextEventId } from './events.js';
export { sanitizeForLog, redactString } from './redact.js';
