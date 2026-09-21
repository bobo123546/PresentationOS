// Capability ABI（总方案 PHASE 3）：平台统一能力契约
// 所有能力（渲染/布局/QA/模型等）必须实现本接口；Provider 可替换。

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ExecutionContext {
  traceId?: string;
  jobId?: string;
  workflowRunId?: string;
  requestId?: string;
  timeoutMs?: number;
  /** 允许写出的 artifact 目录 */
  artifactDir?: string;
  [key: string]: unknown;
}

export interface ExecutionResult<O> {
  ok: boolean;
  output: O | null;
  errorType?: string;
  errorMessage?: string;
  durationMs: number;
  artifactRefs: string[];
}

export interface Capability<I, O> {
  readonly id: string;
  readonly version: string;
  validateInput(input: I): ValidationResult;
  execute(input: I, context: ExecutionContext): Promise<ExecutionResult<O>>;
  validateOutput(output: O): ValidationResult;
}
