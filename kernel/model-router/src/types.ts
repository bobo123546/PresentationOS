// PHASE 14 Model Router —— 类型定义
// 能力 -> 候选模型 -> 统一 OpenAI 兼容协议 -> 健康检查 -> 回退链

export interface ModelConfig {
  id: string; // 全局唯一，如 local.qwen
  provider: 'openai' | 'ollama' | 'anthropic' | 'unknown';
  model: string; // 上游模型名，如 qwen2.5:14b / gpt-4o
  baseUrl: string;
  apiKeyRef?: string; // 环境变量名，如 env:OPENAI_API_KEY（不落盘明文）
  capabilities: string[]; // 如 ['deck.design', 'narrative', 'vision.qa']
  local: boolean;
  timeoutMs?: number;
}

export interface RouteRule {
  capability: string;
  models: string[]; // 按优先级，主 -> 回退
}

export interface RouterConfig {
  models: ModelConfig[];
  routes: RouteRule[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  ok: boolean;
  content?: string;
  provider?: string;
  model?: string;
  error?: string;
  errorType?: 'TIMEOUT' | 'HTTP' | 'UNAUTHORIZED' | 'NETWORK' | 'NO_MODEL' | 'OTHER';
}

export interface RouterDecision {
  capability: string;
  attempted: { modelId: string; ok: boolean; error?: string }[];
  final: ChatResult;
  fallbackUsed: boolean;
}
