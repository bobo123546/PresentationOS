// Node Worker：stdio JSON Lines worker（总方案 PHASE 4）
// 启动 → handshake → 循环接收 job_request → 经 Capability Registry 执行 → job_response
import { createInterface } from 'node:readline';
import { encodeMessage, decodeMessage, isJobRequest, PROTOCOL_VERSION, type WorkerHandshake, type JobRequest } from '@pres/worker-protocol';
import { CapabilityRegistry } from '@pres/capability-registry';
import { registerCoreCapabilities } from './capabilities/core.js';

const workerId = process.env.PRES_WORKER_ID ?? `node-worker-${process.pid}`;
const registry = new CapabilityRegistry();
registerCoreCapabilities(registry);

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
  }
});

async function handleJob(req: JobRequest): Promise<void> {
  const started = Date.now();
  try {
    const result = await registry.execute(req.capabilityId, req.input, {
      traceId: req.traceId,
      jobId: req.jobId,
      timeoutMs: req.timeoutMs,
      artifactDir: req.artifactDir,
    });
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
