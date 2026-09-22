import type { PrivilegedRuntime, WorkerJob, WorkerResponse } from './types.js';
export interface PrivilegedHandle {
    send(job: WorkerJob, timeoutMs?: number): Promise<WorkerResponse>;
    stop(): Promise<void>;
}
/** 启动 privileged 插件（独立进程） */
export declare function startPrivileged(runtime: PrivilegedRuntime, cwdOverride?: string): PrivilegedHandle;
/** 由 manifest 构造 privileged 运行时（command 基于插件目录解析） */
export declare function runtimeFromManifest(pluginDir: string, entry: string, capabilityId: string): PrivilegedRuntime;
