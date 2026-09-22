import type { ChatMessage, ChatResult, ModelConfig } from './types.js';
export interface ProviderCallOptions {
    messages: ChatMessage[];
    temperature?: number;
}
export declare function classifyHttpError(status: number, body: string): ChatResult['errorType'];
/** 单次 chat 调用（不重试、不回退） */
export declare function callChat(model: ModelConfig, opts: ProviderCallOptions): Promise<ChatResult>;
