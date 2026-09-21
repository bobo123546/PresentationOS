import type { CanonicalEvent } from './events.js';
export interface LoggerOptions {
    component: string;
    runtime?: string;
    logDir?: string;
    appVersion?: string;
    gitCommit?: string;
    sessionId?: string;
}
export declare class Logger {
    private readonly writer;
    private readonly component;
    private readonly runtime;
    private readonly appVersion?;
    private readonly gitCommit?;
    private readonly sessionId?;
    constructor(opts: LoggerOptions);
    private emit;
    debug(partial: LogPartial): Promise<void>;
    info(partial: LogPartial): Promise<void>;
    warn(partial: LogPartial): Promise<void>;
    error(partial: LogPartial): Promise<void>;
    fatal(partial: LogPartial): Promise<void>;
    getLogPath(): string;
    getLogDir(): string;
}
type LogPartial = Omit<CanonicalEvent, 'event_id' | 'timestamp' | 'timezone' | 'process_id' | 'component' | 'runtime' | 'level'>;
export { JsonlLogWriter } from './jsonl.js';
export { createEvent, nextEventId } from './events.js';
export { sanitizeForLog, redactString } from './redact.js';
export type { CanonicalEvent } from './events.js';
