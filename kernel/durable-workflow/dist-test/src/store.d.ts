export type RunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';
export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export interface WorkflowStepDef<I = unknown, O = unknown> {
    name: string;
    handler: (input: I, ctx: StepContext) => Promise<O>;
    /** 失败后允许的最大尝试次数（默认 1） */
    maxAttempts?: number;
}
export interface StepContext {
    runId: string;
    stepName: string;
    traceId?: string;
}
export interface WorkflowDefinition {
    name: string;
    steps: WorkflowStepDef<any, any>[];
}
export interface WorkflowRun {
    runId: string;
    definition: string;
    status: RunStatus;
    inputJson: string;
    createdAt: string;
    updatedAt: string;
    currentStep: string | null;
}
export interface StepRecord {
    stepId: number;
    runId: string;
    stepName: string;
    status: StepStatus;
    attempt: number;
    inputJson: string | null;
    outputJson: string | null;
    error: string | null;
    checkpointJson: string | null;
    startedAt: string | null;
    finishedAt: string | null;
}
export declare class WorkflowStore {
    private db;
    constructor(dbPath: string);
    createRun(runId: string, definition: WorkflowDefinition, input: unknown): WorkflowRun;
    getRun(runId: string): WorkflowRun | null;
    updateRunStatus(runId: string, status: RunStatus, currentStep?: string | null): void;
    steps(runId: string): StepRecord[];
    markStepInProgress(runId: string, stepName: string, attempt: number, input: unknown): void;
    markStepCompleted(runId: string, stepName: string, output: unknown, checkpoint?: unknown): void;
    markStepFailed(runId: string, stepName: string, error: string): void;
    cancelRun(runId: string): void;
    /** 找最后一个可继续的 run：RUNNING 且存在 FAILED 步骤（可 resume）或 PENDING 步骤 */
    findResumable(): WorkflowRun[];
    close(): void;
}
