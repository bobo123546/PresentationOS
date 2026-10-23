// Node Worker：stdio JSON Lines worker（总方案 PHASE 4）
// 启动 → handshake → 循环接收 job_request → 经 Capability Registry 执行 → job_response
import { createInterface } from 'node:readline';
import {
  encodeMessage, decodeMessage, isJobRequest, isJobCancel, PROTOCOL_VERSION,
  type WorkerHandshake, type JobRequest, type JobCancel,
} from '@pres/worker-protocol';
import { CapabilityRegistry } from '@pres/capability-registry';
import { registerCoreCapabilities } from './capabilities/core.js';

const workerId = process.env.PRES_WORKER_ID ?? `node-worker-${process.pid}`;
const registry = new CapabilityRegistry();
registerCoreCapabilities(registry);

const activeJobs = new Set<string>();

const handshake: WorkerHandshake = {
  type: 'handshake',
  workerId,
  capabilities: [
    { capabilityId: 'text.transform', version: '1.0.0' },
    { capabilityId: 'deck.plan', version: '0.1.0' },
  ],
  protocolVersion: PROTOCOL_VERSION,
  runtime: `node-${process.version}`,
  pid: process.pid,
};

process.stdout.write(encodeMessage(handshake));

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  const m = decodeMessage(line);
  if (!m) return;
  if (isJobRequest(m)) {
    await handleJob(m);
  } else if (isJobCancel(m)) {
    handleCancel(m);
  }
});

function handleCancel(cancel: JobCancel): void {
  const wasActive = activeJobs.has(cancel.jobId);
  activeJobs.delete(cancel.jobId);
  process.stdout.write(encodeMessage({
    type: 'job_cancel_ack',
    jobId: cancel.jobId,
    cancelled: wasActive,
    reason: wasActive ? 'cancelled_while_active' : 'job_not_active',
  }));
}

async function handleJob(req: JobRequest): Promise<void> {
  const started = Date.now();
  activeJobs.add(req.jobId);
  try {
    const result = await registry.execute(req.capabilityId, req.input, {
      traceId: req.traceId,
      jobId: req.jobId,
      timeoutMs: req.timeoutMs,
      artifactDir: req.artifactDir,
    });
    if (!activeJobs.has(req.jobId)) {
      // 任务在执行期间已被取消，不再发送成功响应
      return;
    }
    activeJobs.delete(req.jobId);
    process.stdout.write(encodeMessage({
      type: 'job_response',
      jobId: req.jobId,
      ok: result.ok,
      output: result.output,
      errorType: result.errorType,
      errorMessage: result.errorMessage,
      durationMs: Date.now() - started,
      artifactRefs: result.artifactRefs,
    }));
  } catch (err) {
    if (!activeJobs.has(req.jobId)) return;
    activeJobs.delete(req.jobId);
    process.stdout.write(encodeMessage({
      type: 'job_response',
      jobId: req.jobId,
      ok: false,
      output: null,
      errorType: 'WORKER_EXCEPTION',
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
      artifactRefs: [],
    }));
  }
}

process.on('SIGTERM', () => process.exit(0));
