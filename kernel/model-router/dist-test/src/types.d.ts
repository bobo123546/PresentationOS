export interface ModelConfig {
    id: string;
    provider: 'openai' | 'ollama' | 'anthropic' | 'unknown';
    model: string;
    baseUrl: string;
    apiKeyRef?: string;
    capabilities: string[];
    local: boolean;
    timeoutMs?: number;
}
export interface RouteRule {
    capability: string;
    models: string[];
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
    attempted: {
        modelId: string;
        ok: boolean;
        error?: string;
    }[];
    final: ChatResult;
    fallbackUsed: boolean;
}
