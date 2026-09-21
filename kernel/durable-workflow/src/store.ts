// Durable Workflow（总方案 PHASE 6 / PHASE 11）：SQLite 持久化、checkpoint、resume、cancel
// 基于 Node 22 内置 node:sqlite（DatabaseSync，实验性）。

// eslint-disable-next-line @typescript-eslint/no-require-imports
import { DatabaseSync } from 'node:sqlite';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export class WorkflowStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        run_id TEXT PRIMARY KEY,
        definition TEXT NOT NULL,
        status TEXT NOT NULL,
        input_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        current_step TEXT
      );
      CREATE TABLE IF NOT EXISTS workflow_steps (
        step_id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        input_json TEXT,
        output_json TEXT,
        error TEXT,
        checkpoint_json TEXT,
        started_at TEXT,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_steps_run ON workflow_steps(run_id);
    `);
  }

  createRun(runId: string, definition: WorkflowDefinition, input: unknown): WorkflowRun {
    const now = new Date().toISOString();
    const inputJson = JSON.stringify(input ?? null);
    this.db.prepare(
      'INSERT INTO workflow_runs (run_id, definition, status, input_json, created_at, updated_at, current_step) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(runId, definition.name, 'RUNNING', inputJson, now, now, null);
    for (const s of definition.steps) {
      this.db.prepare(
        'INSERT INTO workflow_steps (run_id, step_name, status, attempt) VALUES (?, ?, ?, ?)'
      ).run(runId, s.name, 'PENDING', 0);
    }
    return this.getRun(runId)!;
  }

  getRun(runId: string): WorkflowRun | null {
    const row = this.db.prepare('SELECT * FROM workflow_runs WHERE run_id = ?').get(runId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      runId: String(row.run_id), definition: String(row.definition), status: row.status as RunStatus,
      inputJson: String(row.input_json), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      currentStep: row.current_step ? String(row.current_step) : null,
    };
  }

  updateRunStatus(runId: string, status: RunStatus, currentStep: string | null = null): void {
    this.db.prepare('UPDATE workflow_runs SET status = ?, current_step = ?, updated_at = ? WHERE run_id = ?')
      .run(status, currentStep, new Date().toISOString(), runId);
  }

  steps(runId: string): StepRecord[] {
    const rows = this.db.prepare('SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY step_id').all(runId) as Record<string, unknown>[];
    return rows.map((r) => ({
      stepId: Number(r.step_id), runId: String(r.run_id), stepName: String(r.step_name), status: r.status as StepStatus,
      attempt: Number(r.attempt), inputJson: r.input_json ? String(r.input_json) : null, outputJson: r.output_json ? String(r.output_json) : null,
      error: r.error ? String(r.error) : null, checkpointJson: r.checkpoint_json ? String(r.checkpoint_json) : null,
      startedAt: r.started_at ? String(r.started_at) : null, finishedAt: r.finished_at ? String(r.finished_at) : null,
    }));
  }

  markStepInProgress(runId: string, stepName: string, attempt: number, input: unknown): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE workflow_steps SET status = ?, attempt = ?, input_json = ?, started_at = ?, error = NULL WHERE run_id = ? AND step_name = ?')
      .run('IN_PROGRESS', attempt, JSON.stringify(input ?? null), now, runId, stepName);
  }

  markStepCompleted(runId: string, stepName: string, output: unknown, checkpoint: unknown = null): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE workflow_steps SET status = ?, output_json = ?, checkpoint_json = ?, finished_at = ? WHERE run_id = ? AND step_name = ?')
      .run('COMPLETED', JSON.stringify(output ?? null), checkpoint ? JSON.stringify(checkpoint) : null, now, runId, stepName);
  }

  markStepFailed(runId: string, stepName: string, error: string): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE workflow_steps SET status = ?, error = ?, finished_at = ? WHERE run_id = ? AND step_name = ?')
      .run('FAILED', error, now, runId, stepName);
  }

  cancelRun(runId: string): void {
    this.updateRunStatus(runId, 'CANCELLED');
  }

  /** 找最后一个可继续的 run：RUNNING 且存在 FAILED 步骤（可 resume）或 PENDING 步骤 */
  findResumable(): WorkflowRun[] {
    const rows = this.db.prepare("SELECT DISTINCT r.* FROM workflow_runs r JOIN workflow_steps s ON r.run_id = s.run_id WHERE r.status = 'RUNNING' AND (s.status = 'FAILED' OR s.status = 'PENDING')").all() as Record<string, unknown>[];
    return rows.map((row) => ({
      runId: String(row.run_id), definition: String(row.definition), status: row.status as RunStatus,
      inputJson: String(row.input_json), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      currentStep: row.current_step ? String(row.current_step) : null,
    }));
  }

  close(): void { this.db.close(); }
}
