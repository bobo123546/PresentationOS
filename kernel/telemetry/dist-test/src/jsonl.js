// JSONL append-only writer（总方案 PHASE 19）
// 存储：D:\PresentationOSData\logs\YYYY-MM-DD.jsonl
// 规则：append-only；禁止静默覆盖/删除；写盘前脱敏。
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sanitizeForLog } from './redact.js';
export class JsonlLogWriter {
    logDir;
    appVersion;
    gitCommit;
    currentDay;
    currentPath;
    writeChain = Promise.resolve();
    constructor(opts = {}) {
        this.logDir = opts.logDir ?? process.env.PRES_LOG_DIR ?? 'D:\\PresentationOSData\\logs';
        this.appVersion = opts.appVersion;
        this.gitCommit = opts.gitCommit;
        const now = new Date();
        this.currentDay = this.dayKey(now);
        this.currentPath = join(this.logDir, `${this.currentDay}.jsonl`);
    }
    dayKey(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    async ensureDir() {
        await mkdir(this.logDir, { recursive: true });
    }
    async write(event) {
        const now = new Date();
        const day = this.dayKey(now);
        if (day !== this.currentDay) {
            this.currentDay = day;
            this.currentPath = join(this.logDir, `${day}.jsonl`);
        }
        const safe = sanitizeForLog(event);
        const line = JSON.stringify({ ...safe, app_version: safe.app_version ?? this.appVersion, git_commit: safe.git_commit ?? this.gitCommit });
        // 串行化写盘（单写者保证，避免交错/半行）
        this.writeChain = this.writeChain.then(async () => {
            await this.ensureDir();
            await appendFile(this.currentPath, line + '\n', 'utf8');
        });
        await this.writeChain;
    }
    /** 当前日志文件路径（供 UI/CLI 打开日志目录） */
    getCurrentLogPath() {
        return this.currentPath;
    }
    getLogDir() {
        return this.logDir;
    }
}
