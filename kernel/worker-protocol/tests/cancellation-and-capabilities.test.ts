import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnWorker } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../../');
const NODE_WORKER_ENTRY = resolve(REPO_ROOT, 'workers/node-worker/dist/worker.js');

test('WorkerProcess: cancelJob sends job_cancel and resolves pending job as JOB_CANCELLED', async () => {
  const worker = spawnWorker({
    command: process.execPath,
    args: [NODE_WORKER_ENTRY],
    cwd: REPO_ROOT,
  });

  try {
    const handshake = await worker.waitHandshake();
    assert.ok(handshake, 'handshake received');

    // 提交一个 job
    const jobPromise = worker.submitJob({
      jobId: 'job-to-cancel-001',
      capabilityId: 'text.transform',
      input: { text: 'hello' },
    });

    // 立即发起取消
    const cancelAck = await worker.cancelJob('job-to-cancel-001', 'test_cancel');
    const result = await jobPromise;

    assert.equal(result.ok, false);
    assert.equal(result.errorType, 'JOB_CANCELLED');
    assert.match(result.errorMessage ?? '', /cancelled/);
  } finally {
    await worker.close();
  }
});

test('WorkerProcess: expectedCapabilities check rejects incompatible worker', async () => {
  const worker = spawnWorker({
    command: process.execPath,
    args: [NODE_WORKER_ENTRY],
    cwd: REPO_ROOT,
    expectedCapabilities: ['non.existent.capability.v999'],
  });

  try {
    const handshake = await worker.waitHandshake(2000);
    // 因为缺少期望的 capability，握手被阻断为 null
    assert.equal(handshake, null, 'handshake must be null when expected capability is missing');
    assert.match(worker.stderrLog(), /missing-expected-capabilities/);
  } finally {
    await worker.close();
  }
});
