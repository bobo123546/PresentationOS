import type { PluginManifest, SafeRunResult } from './types.js';
export interface SafeRuntimeOptions {
    manifest: PluginManifest;
    rootDir: string;
    log?: (msg: string) => void;
}
/** 执行 safe 插件：entry 源码中必须定义 async run(input)，在受限沙箱中调用 */
export declare function runSafePlugin(opts: SafeRuntimeOptions, input: unknown): Promise<SafeRunResult>;
