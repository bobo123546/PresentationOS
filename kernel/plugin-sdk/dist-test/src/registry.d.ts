import type { PluginManifest, SafeRunResult, WorkerJob, WorkerResponse } from './types.js';
export interface RegisteredPlugin {
    manifest: PluginManifest;
    rootDir: string;
    type: 'safe' | 'privileged';
    capabilityId?: string;
}
export declare class PluginRegistry {
    private safe;
    private privileged;
    /** 注册插件目录：读取 plugin.yaml -> 校验 -> 加载 */
    register(pluginDir: string): {
        ok: boolean;
        error?: string;
    };
    list(): RegisteredPlugin[];
    has(name: string): boolean;
    /** 执行 safe 插件 */
    runSafe(name: string, input: unknown): Promise<SafeRunResult>;
    /** 向 privileged 插件发送 job（worker-protocol 协议） */
    callPrivileged(name: string, job: Omit<WorkerJob, 'type' | 'capabilityId'>): Promise<WorkerResponse>;
    /** 全部停止（释放 privileged 进程） */
    shutdown(): Promise<void>;
}
