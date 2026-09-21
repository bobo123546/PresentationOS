import type { CanonicalEvent } from './events.js';
export interface JsonlWriterOptions {
    logDir?: string;
    appVersion?: string;
    gitCommit?: string;
}
export declare class JsonlLogWriter {
    private readonly logDir;
    private readonly appVersion?;
    private readonly gitCommit?;
    private currentDay;
    private currentPath;
    private writeChain;
    constructor(opts?: JsonlWriterOptions);
    private dayKey;
    private ensureDir;
    write(event: CanonicalEvent): Promise<void>;
    /** 当前日志文件路径（供 UI/CLI 打开日志目录） */
    getCurrentLogPath(): string;
    getLogDir(): string;
}
