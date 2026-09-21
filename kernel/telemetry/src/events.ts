// Canonical Event Schema（总方案 PHASE 19，36+ 字段）
// 统一日志的唯一事件类型：所有组件/Worker 必须用本类型写日志。

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface CanonicalEvent {
  event_id: string;
  timestamp: string; // ISO 8601 with timezone
  timezone: string;
  level: LogLevel;
  session_id?: string;
  trace_id?: string;
  span_id?: string;
  task_id?: string;
  workflow_run_id?: string;
  workflow_step_id?: string;
  job_id?: string;
  component: string;
  runtime: string;
  process_id: number;
  thread_id?: string;
  event_type: string;
  action?: string;
  target_type?: string;
  target_id?: string;
  capability?: string;
  provider?: string;
  before_state?: unknown;
  after_state?: unknown;
  input_summary?: string;
  output_summary?: string;
  result?: string;
  error_type?: string;
  error_code?: string;
  error_message?: string;
  duration_ms?: number;
  artifact_refs?: string[];
  evidence_refs?: string[];
  app_version?: string;
  git_commit?: string;
}

let seq = 0;

export function nextEventId(): string {
  seq += 1;
  return `${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEvent(
  partial: Omit<CanonicalEvent, 'event_id' | 'timestamp' | 'timezone' | 'process_id'>
): CanonicalEvent {
  const now = new Date();
  return {
    ...partial,
    event_id: nextEventId(),
    timestamp: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    process_id: process.pid,
  };
}
