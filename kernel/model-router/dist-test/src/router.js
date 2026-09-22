// 路由器：capability -> 候选模型（按优先级）-> 调用 -> 失败回退
import { callChat } from './providers.js';
export class ModelRouter {
    config;
    constructor(config) {
        this.config = config;
    }
    modelById(id) {
        return this.config.models.find((m) => m.id === id);
    }
    /** 该 capability 的候选模型（路由规则 + 能力匹配，去重保序） */
    candidatesFor(capability) {
        const out = [];
        const seen = new Set();
        const rule = this.config.routes.find((r) => r.capability === capability);
        const add = (id) => {
            if (!seen.has(id)) {
                seen.add(id);
                out.push(id);
            }
        };
        if (rule) {
            for (const id of rule.models)
                add(id);
        }
        for (const m of this.config.models) {
            if (m.capabilities.includes(capability))
                add(m.id);
        }
        return out;
    }
    /** 路由执行：依次尝试候选，失败回退，记录 decision */
    async route(capability, messages, temperature) {
        const attempted = [];
        const ids = this.candidatesFor(capability);
        if (ids.length === 0) {
            const final = { ok: false, errorType: 'NO_MODEL', error: `capability ${capability} 无可用模型` };
            return { capability, attempted, final, fallbackUsed: false };
        }
        let last;
        for (const id of ids) {
            const model = this.modelById(id);
            if (!model)
                continue;
            const r = await callChat(model, { messages, temperature });
            attempted.push({ modelId: id, ok: r.ok, error: r.error });
            last = r;
            if (r.ok) {
                return { capability, attempted, final: r, fallbackUsed: attempted.length > 1 };
            }
        }
        return {
            capability,
            attempted,
            final: last ?? { ok: false, errorType: 'NO_MODEL', error: '无候选模型' },
            fallbackUsed: false,
        };
    }
}
