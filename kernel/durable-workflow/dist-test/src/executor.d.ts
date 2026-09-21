import { WorkflowStore, type WorkflowDefinition, type RunStatus } from './store.js';
export interface ExecutorOptions {
    /** 是否暂停执行（供测试 cancel） */
    shouldPause?: (stepName: string, runId: string) => boolean;
}
export declare class WorkflowExecutor {
    private readonly store;
    private readonly defs;
    private readonly opts;
    constructor(store: WorkflowStore, opts?: ExecutorOptions);
    register(def: WorkflowDefinition): void;
    has(name: string): boolean;
    start(name: string, input: unknown): Promise<string>;
    /** 从头或从断点继续执行；返回最终状态 */
    run(runId: string): Promise<{
        status: RunStatus;
        failedStep?: string;
        error?: string;
    }>;
    cancel(runId: string): void;
    get storeInstance(): WorkflowStore;
}
