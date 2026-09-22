import type { RouterConfig } from './types.js';
export interface ConfigResult {
    ok: boolean;
    config?: RouterConfig;
    errors: string[];
}
export declare function validateRouterConfig(raw: unknown): ConfigResult;
/** 读取并校验 yaml 配置文件 */
export declare function loadRouterConfig(path: string): ConfigResult;
/** 从环境变量解析 apiKeyRef（env:NAME 形式） */
export declare function resolveApiKey(ref: string | undefined): string | undefined;
