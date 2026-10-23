// 路由器：capability -> 候选模型（按优先级）-> 调用 -> 失败回退
import { callChat } from './providers.js';
import type { ChatMessage, ChatResult, RouterConfig, RouterDecision } from './types.js';

export class ModelRouter {
  constructor(private config: RouterConfig) {}

  private modelById(id: string) {
    return this.config.models.find((m) => m.id === id);
  }

  /** 该 capability 的候选模型（路由规则 + 能力匹配，去重保序） */
  candidatesFor(capability: string, localOnly: boolean = false): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const rule = this.config.routes.find((r) => r.capability === capability);
    const add = (id: string) => {
      const model = this.modelById(id);
      if (!model) return;
      if (localOnly && !model.local) return; // 本地限定模式：强行过滤所有云端模型
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    };
    if (rule) {
      for (const id of rule.models) add(id);
    }
    for (const m of this.config.models) {
      if (m.capabilities.includes(capability)) add(m.id);
    }
    return out;
  }

  /** 路由执行：依次尝试候选，失败回退，记录 decision */
  async route(
    capability: string,
    messages: ChatMessage[],
    temperatureOrOpts?: number | import('./types.js').RouteOptions
  ): Promise<RouterDecision> {
    const opts: import('./types.js').RouteOptions =
      typeof temperatureOrOpts === 'number'
        ? { temperature: temperatureOrOpts }
        : temperatureOrOpts ?? {};

    const attempted: RouterDecision['attempted'] = [];
    const ids = this.candidatesFor(capability, opts.localOnly);
    if (ids.length === 0) {
      const errorMsg = opts.localOnly
        ? `capability ${capability} 在本地限定模式下无可用模型（云端 fallback 已强行禁止）`
        : `capability ${capability} 无可用模型`;
      const final: ChatResult = {
        ok: false,
        errorType: opts.localOnly ? 'LOCAL_ONLY_VIOLATION' : 'NO_MODEL',
        error: errorMsg,
      };
      return { capability, attempted, final, fallbackUsed: false };
    }
    let last: ChatResult | undefined;
    for (const id of ids) {
      const model = this.modelById(id);
      if (!model) continue;
      const r = await callChat(model, { messages, temperature: opts.temperature });
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
