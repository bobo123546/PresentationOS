export declare function redactString(value: string): string;
export declare function redactObject<T>(input: T): T;
/** 深度脱敏后的安全日志对象（禁止直接记录原始输入） */
export declare function sanitizeForLog<T>(input: T): unknown;
