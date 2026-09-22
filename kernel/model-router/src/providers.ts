// OpenAI 兼容 Chat Completions Provider（fetch 调用，超时控制）
import { resolveApiKey } from './config.js';
import type { ChatMessage, ChatResult, ModelConfig } from './types.js';

export interface ProviderCallOptions {
  messages: ChatMessage[];
  temperature?: number;
}

export function classifyHttpError(status: number, body: string): ChatResult['errorType'] {
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status >= 500) return 'HTTP';
  if (status === 429) return 'HTTP';
  return 'HTTP';
}

/** 单次 chat 调用（不重试、不回退） */
export async function callChat(model: ModelConfig, opts: ProviderCallOptions): Promise<ChatResult> {
  const key = resolveApiKey(model.apiKeyRef);
  const url = `${model.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), model.timeoutMs ?? 30000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.7,
      }),
      signal: controller.signal,
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { ok: false, errorType: classifyHttpError(resp.status, text), error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }
    const data = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return { ok: false, errorType: 'OTHER', error: '响应缺少 choices[0].message.content' };
    }
    return { ok: true, content, provider: model.id, model: model.model };
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      return { ok: false, errorType: 'TIMEOUT', error: `超时 ${model.timeoutMs}ms` };
    }
    return { ok: false, errorType: 'NETWORK', error: err.message };
  } finally {
    clearTimeout(timer);
  }
}
