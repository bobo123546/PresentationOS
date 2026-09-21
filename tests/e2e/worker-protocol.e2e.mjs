// E2E：spawn Node Worker → handshake → job → 响应（总方案 PHASE 4 Vertical）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnWorker } from '../../kernel/worker-protocol/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const workerEntry = join(here, '../../workers/node-worker/dist/worker.js');

test('node worker handshake + text.transform job', async () => {
  const w = spawnWorker({ command: process.execPath, args: [workerEntry], workerId: 'e2e-1' });
  try {
    const h = await w.waitHandshake(10000);
    assert.ok(h, 'handshake received');
    assert.equal(h.type, 'handshake');
    assert.equal(h.protocolVersion, '0.1.0');
    assert.ok(h.capabilities.some((c) => c.capabilityId === 'text.transform'));

    const r = await w.submitJob({ jobId: 'j1', traceId: 'trc-e2e', capabilityId: 'text.transform', input: { text: 'hello worker' } }, 10000);
    assert.equal(r.ok, true);
    assert.equal(r.output.text, 'HELLO WORKER');
    assert.equal(r.durationMs >= 0, true);
  } finally {
    await w.close();
  }
});

test('node worker deck.plan job', async () => {
  const w = spawnWorker({ command: process.execPath, args: [workerEntry], workerId: 'e2e-2' });
  try {
    await w.waitHandshake(10000);
    const r = await w.submitJob({ jobId: 'j2', capabilityId: 'deck.plan', input: { topic: 'AI Presentation', slides: 4 } }, 10000);
    assert.equal(r.ok, true);
    assert.equal(r.output.title, 'AI Presentation');
    assert.equal(r.output.slideCount, 4);
  } finally {
    await w.close();
  }
});

test('unknown capability returns failure', async () => {
  const w = spawnWorker({ command: process.execPath, args: [workerEntry], workerId: 'e2e-3' });
  try {
    await w.waitHandshake(10000);
    const r = await w.submitJob({ jobId: 'j3', capabilityId: 'no.such.capability', input: {} }, 10000);
    assert.equal(r.ok, false);
    assert.equal(r.errorType, 'CAPABILITY_NOT_FOUND');
  } finally {
    await w.close();
  }
});

test('invalid input rejected', async () => {
  const w = spawnWorker({ command: process.execPath, args: [workerEntry], workerId: 'e2e-4' });
  try {
    await w.waitHandshake(10000);
    const r = await w.submitJob({ jobId: 'j4', capabilityId: 'text.transform', input: { text: 42 } }, 10000);
    assert.equal(r.ok, false);
    assert.match(r.errorMessage ?? '', /input validation failed/);
  } finally {
    await w.close();
  }
});
