// Worker Protocol（总方案 PHASE 4 / PHASE 11）
// JSON Lines over stdio；每个消息一行 JSON。支持 handshake / job / cancel / heartbeat / status。

export type WorkerMessageType = 'handshake' | 'job_request' | 'job_response' | 'heartbeat' | 'job_cancel' | 'status';

export interface WorkerHandshake {
  type: 'handshake';
  workerId: string;
  capabilities: Array<{ capabilityId: string; version: string }>;
  protocolVersion: string;
  runtime: string;
  pid: number;
}

export interface JobRequest {
  type: 'job_request';
  jobId: string;
  traceId?: string;
  capabilityId: string;
  input: unknown;
  timeoutMs?: number;
  artifactDir?: string;
}

export interface JobResponse {
  type: 'job_response';
  jobId: string;
  ok: boolean;
  output: unknown | null;
  errorType?: string;
  errorMessage?: string;
  durationMs: number;
  artifactRefs: string[];
}

export interface Heartbeat {
  type: 'heartbeat';
  workerId: string;
  ts: string;
  queueLength: number;
}

export interface JobCancel {
  type: 'job_cancel';
  jobId: string;
}

export interface StatusQuery {
  type: 'status';
  workerId: string;
}

export type WorkerMessage = WorkerHandshake | JobRequest | JobResponse | Heartbeat | JobCancel | StatusQuery;

export const PROTOCOL_VERSION = '0.1.0';

export function encodeMessage(m: WorkerMessage): string {
  return JSON.stringify(m) + '\n';
}

export function decodeMessage(line: string): WorkerMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed) as WorkerMessage;
    if (typeof obj.type !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

export function isJobRequest(m: WorkerMessage): m is JobRequest {
  return m.type === 'job_request';
}
export function isJobResponse(m: WorkerMessage): m is JobResponse {
  return m.type === 'job_response';
}
