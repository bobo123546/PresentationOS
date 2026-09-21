import type { Capability, ExecutionContext, ExecutionResult } from './capability.js';
export interface ProviderRegistration<I, O> {
    capabilityId: string;
    providerId: string;
    provider: Capability<I, O>;
    /** 数字越小优先级越高；默认 100 */
    priority: number;
    runtime: string;
    provenance?: string;
    healthy: boolean;
}
export interface ResolveOptions {
    /** 指定 providerId，跳过优先级 */
    providerId?: string;
    /** 主 provider 失败后是否尝试 fallback（默认 true） */
    fallback?: boolean;
}
export declare class CapabilityRegistry {
    private readonly providers;
    register<I, O>(reg: Omit<ProviderRegistration<I, O>, 'healthy'>): void;
    setHealth(capabilityId: string, providerId: string, healthy: boolean): void;
    has(capabilityId: string): boolean;
    list(capabilityId: string): Array<{
        providerId: string;
        priority: number;
        runtime: string;
        healthy: boolean;
        provenance?: string;
    }>;
    execute<I, O>(capabilityId: string, input: I, context: ExecutionContext, opts?: ResolveOptions): Promise<ExecutionResult<O>>;
}
