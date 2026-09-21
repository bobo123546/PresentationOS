// Capability Registry（总方案 PHASE 3）
// 同一 capability id 可注册多个 provider；默认选 priority 最高者，失败可 fallback。
export class CapabilityRegistry {
    providers = new Map();
    register(reg) {
        const list = this.providers.get(reg.capabilityId) ?? [];
        list.push({ ...reg, healthy: true });
        list.sort((a, b) => a.priority - b.priority);
        this.providers.set(reg.capabilityId, list);
    }
    setHealth(capabilityId, providerId, healthy) {
        const list = this.providers.get(capabilityId);
        const p = list?.find((x) => x.providerId === providerId);
        if (p)
            p.healthy = healthy;
    }
    has(capabilityId) {
        return (this.providers.get(capabilityId)?.length ?? 0) > 0;
    }
    list(capabilityId) {
        return (this.providers.get(capabilityId) ?? []).map((p) => ({
            providerId: p.providerId, priority: p.priority, runtime: p.runtime, healthy: p.healthy, provenance: p.provenance,
        }));
    }
    async execute(capabilityId, input, context, opts = {}) {
        const list = this.providers.get(capabilityId);
        if (!list || list.length === 0) {
            return { ok: false, output: null, errorType: 'CAPABILITY_NOT_FOUND', errorMessage: `no provider registered for ${capabilityId}`, durationMs: 0, artifactRefs: [] };
        }
        const candidates = opts.providerId ? list.filter((p) => p.providerId === opts.providerId) : list.filter((p) => p.healthy);
        if (candidates.length === 0) {
            return { ok: false, output: null, errorType: 'NO_HEALTHY_PROVIDER', errorMessage: `no healthy provider for ${capabilityId}`, durationMs: 0, artifactRefs: [] };
        }
        const shouldFallback = opts.fallback ?? true;
        let lastError;
        for (const reg of candidates) {
            const started = Date.now();
            const vin = reg.provider.validateInput(input);
            if (!vin.valid) {
                lastError = `input validation failed: ${vin.errors.join('; ')}`;
                if (!shouldFallback)
                    break;
                continue;
            }
            try {
                const r = await reg.provider.execute(input, context);
                r.durationMs = Date.now() - started;
                if (r.ok)
                    return r;
                lastError = r.errorMessage ?? r.errorType ?? 'execute failed';
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
            }
            if (!shouldFallback)
                break;
        }
        return { ok: false, output: null, errorType: 'ALL_PROVIDERS_FAILED', errorMessage: lastError, durationMs: 0, artifactRefs: [] };
    }
}
