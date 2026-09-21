export class WorkflowExecutor {
    store;
    defs = new Map();
    opts;
    constructor(store, opts = {}) {
        this.store = store;
        this.opts = opts;
    }
    register(def) { this.defs.set(def.name, def); }
    has(name) { return this.defs.has(name); }
    async start(name, input) {
        const def = this.defs.get(name);
        if (!def)
            throw new Error(`workflow not registered: ${name}`);
        const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.store.createRun(runId, def, input);
        return runId;
    }
    /** 从头或从断点继续执行；返回最终状态 */
    async run(runId) {
        const run = this.store.getRun(runId);
        if (!run)
            throw new Error(`run not found: ${runId}`);
        if (run.status === 'CANCELLED')
            return { status: 'CANCELLED' };
        const def = this.defs.get(run.definition);
        if (!def)
            throw new Error(`workflow definition not registered: ${run.definition}`);
        const input = run.inputJson ? JSON.parse(run.inputJson) : null;
        const steps = this.store.steps(runId);
        let currentInput = input;
        for (const step of steps) {
            if (this.opts.shouldPause?.(step.stepName, runId)) {
                this.store.updateRunStatus(runId, 'PAUSED', step.stepName);
                return { status: 'PAUSED' };
            }
            if (step.status === 'COMPLETED') {
                // 已完成的步骤：用其输出作为下一步输入
                if (step.outputJson)
                    currentInput = JSON.parse(step.outputJson);
                continue;
            }
            const defStep = def.steps.find((s) => s.name === step.stepName);
            if (!defStep) {
                this.store.markStepFailed(runId, step.stepName, 'step not in definition');
                continue;
            }
            const maxAttempts = defStep.maxAttempts ?? 1;
            let attempt = step.attempt + 1;
            const stepInput = step.inputJson ? JSON.parse(step.inputJson) : currentInput;
            const ctx = { runId, stepName: step.stepName };
            this.store.markStepInProgress(runId, step.stepName, attempt, stepInput);
            try {
                const out = await defStep.handler(stepInput, ctx);
                this.store.markStepCompleted(runId, step.stepName, out, { attempts: attempt });
                currentInput = out;
                // checkpoint：每个步骤完成后更新 run.current_step
                this.store.updateRunStatus(runId, 'RUNNING', step.stepName);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.store.markStepFailed(runId, step.stepName, msg);
                if (attempt < maxAttempts) {
                    // 重试：下一次 run() 会重新尝试（attempt 递增）
                    return { status: 'FAILED', failedStep: step.stepName, error: msg };
                }
                this.store.updateRunStatus(runId, 'FAILED', step.stepName);
                return { status: 'FAILED', failedStep: step.stepName, error: msg };
            }
        }
        this.store.updateRunStatus(runId, 'COMPLETED', null);
        return { status: 'COMPLETED' };
    }
    cancel(runId) { this.store.cancelRun(runId); }
    get storeInstance() { return this.store; }
}
