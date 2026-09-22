// 配置加载与校验（models.yaml / router.yaml）
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { ModelConfig, RouterConfig, RouteRule } from './types.js';

export interface ConfigResult {
  ok: boolean;
  config?: RouterConfig;
  errors: string[];
}

export function validateRouterConfig(raw: unknown): ConfigResult {
  const errors: string[] = [];
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, errors: ['配置必须是对象'] };
  }
  const m = raw as Record<string, unknown>;

  const modelsRaw = m.models;
  const models: ModelConfig[] = [];
  if (!Array.isArray(modelsRaw) || modelsRaw.length === 0) {
    errors.push('models 必填且非空');
  } else {
    const ids = new Set<string>();
    for (const item of modelsRaw) {
      const mm = item as Record<string, unknown>;
      const id = mm.id;
      if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-_.]*$/.test(id)) {
        errors.push('model.id 非法: ' + String(id));
        continue;
      }
      if (ids.has(id)) errors.push(`model.id 重复: ${id}`);
      ids.add(id);
      if (typeof mm.model !== 'string' || mm.model.length === 0) errors.push(`model[${id}].model 必填`);
      if (typeof mm.baseUrl !== 'string' || !/^https?:\/\//.test(mm.baseUrl)) {
        errors.push(`model[${id}].baseUrl 必须是 http(s) URL`);
      }
      if (mm.apiKeyRef !== undefined && typeof mm.apiKeyRef !== 'string') {
        errors.push(`model[${id}].apiKeyRef 必须是字符串（如 env:OPENAI_API_KEY）`);
      }
      const caps = mm.capabilities;
      if (!Array.isArray(caps) || caps.length === 0) {
        errors.push(`model[${id}].capabilities 必填且非空`);
      }
      const provider = ['openai', 'ollama', 'anthropic', 'unknown'].includes(String(mm.provider))
        ? (mm.provider as ModelConfig['provider'])
        : 'unknown';
      models.push({
        id,
        provider,
        model: String(mm.model ?? ''),
        baseUrl: String(mm.baseUrl ?? ''),
        apiKeyRef: typeof mm.apiKeyRef === 'string' ? mm.apiKeyRef : undefined,
        capabilities: (caps as unknown[]).map(String),
        local: mm.local === true,
        timeoutMs: typeof mm.timeoutMs === 'number' ? mm.timeoutMs : 30000,
      });
    }
  }

  const routesRaw = m.routes;
  const routes: RouteRule[] = [];
  if (!Array.isArray(routesRaw) || routesRaw.length === 0) {
    errors.push('routes 必填且非空');
  } else {
    const capSeen = new Set<string>();
    for (const item of routesRaw) {
      const rr = item as Record<string, unknown>;
      const capability = rr.capability;
      if (typeof capability !== 'string' || capability.length === 0) {
        errors.push('route.capability 必填');
        continue;
      }
      if (capSeen.has(capability)) errors.push(`route 重复: ${capability}`);
      capSeen.add(capability);
      const modelIds = rr.models;
      if (!Array.isArray(modelIds) || modelIds.length === 0) {
        errors.push(`route[${capability}].models 必填且非空（按优先级）`);
        continue;
      }
      routes.push({ capability, models: modelIds.map(String) });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, config: { models, routes }, errors: [] };
}

/** 读取并校验 yaml 配置文件 */
export function loadRouterConfig(path: string): ConfigResult {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return { ok: false, errors: [`无法读取配置: ${(e as Error).message}`] };
  }
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    return { ok: false, errors: [`配置解析失败: ${(e as Error).message}`] };
  }
  return validateRouterConfig(raw);
}

/** 从环境变量解析 apiKeyRef（env:NAME 形式） */
export function resolveApiKey(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  if (ref.startsWith('env:')) {
    return process.env[ref.slice(4)] || undefined;
  }
  return ref;
}
