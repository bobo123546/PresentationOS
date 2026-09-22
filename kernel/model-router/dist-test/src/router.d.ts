import type { ChatMessage, RouterConfig, RouterDecision } from './types.js';
export declare class ModelRouter {
    private config;
    constructor(config: RouterConfig);
    private modelById;
    /** 该 capability 的候选模型（路由规则 + 能力匹配，去重保序） */
    candidatesFor(capability: string): string[];
    /** 路由执行：依次尝试候选，失败回退，记录 decision */
    route(capability: string, messages: ChatMessage[], temperature?: number): Promise<RouterDecision>;
}
