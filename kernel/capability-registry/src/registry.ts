// Capability Registry（总方案 PHASE 3）
// 同一 capability id 可注册多个 provider；默认选 priority 最高者，失败可 fallback。

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

export class CapabilityRegistry {
  private readonly providers = new Map<string, ProviderRegistration<unknown, unknown>[]>();

  register<I, O>(reg: Omit<ProviderRegistration<I, O>, 'healthy'>): void {
    const list = this.providers.get(reg.capabilityId) ?? [];
    list.push({ ...reg, healthy: true } as ProviderRegistration<unknown, unknown>);
    list.sort((a, b) => a.priority - b.priority);
    this.providers.set(reg.capabilityId, list);
  }

  setHealth(capabilityId: string, providerId: string, healthy: boolean): void {
    const list = this.providers.get(capabilityId);
    const p = list?.find((x) => x.providerId === providerId);
    if (p) p.healthy = healthy;
  }

  has(capabilityId: string): boolean {
    return (this.providers.get(capabilityId)?.length ?? 0) > 0;
  }

  list(capabilityId: string): Array<{ providerId: string; priority: number; runtime: string; healthy: boolean; provenance?: string }> {
    return (this.providers.get(capabilityId) ?? []).map((p) => ({
      providerId: p.providerId, priority: p.priority, runtime: p.runtime, healthy: p.healthy, provenance: p.provenance,
    }));
  }

  async execute<I, O>(capabilityId: string, input: I, context: ExecutionContext, opts: ResolveOptions = {}): Promise<ExecutionResult<O>> {
    const list = this.providers.get(capabilityId);
    if (!list || list.length === 0) {
      return { ok: false, output: null, errorType: 'CAPABILITY_NOT_FOUND', errorMessage: `no provider registered for ${capabilityId}`, durationMs: 0, artifactRefs: [] };
    }
    const candidates = opts.providerId ? list.filter((p) => p.providerId === opts.providerId) : list.filter((p) => p.healthy);
    if (candidates.length === 0) {
      return { ok: false, output: null, errorType: 'NO_HEALTHY_PROVIDER', errorMessage: `no healthy provider for ${capabilityId}`, durationMs: 0, artifactRefs: [] };
    }
    const shouldFallback = opts.fallback ?? true;
    let lastError: string | undefined;
    for (const reg of candidates) {
      const started = Date.now();
      const vin = (reg.provider as unknown as Capability<I, O>).validateInput(input);
      if (!vin.valid) {
        lastError = `input validation failed: ${vin.errors.join('; ')}`;
        if (!shouldFallback) break;
        continue;
      }
      try {
        const r = await (reg.provider as unknown as Capability<I, O>).execute(input, context);
        r.durationMs = Date.now() - started;
        if (r.ok) return r;
        lastError = r.errorMessage ?? r.errorType ?? 'execute failed';
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
      if (!shouldFallback) break;
    }
    return { ok: false, output: null, errorType: 'ALL_PROVIDERS_FAILED', errorMessage: lastError, durationMs: 0, artifactRefs: [] };
  }
}
