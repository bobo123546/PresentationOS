import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeMessage,
  decodeMessage,
  isJobRequest,
  isJobResponse,
  PROTOCOL_VERSION,
  type WorkerHandshake,
  type JobRequest,
  type JobResponse,
} from '../src/protocol.js';
import { spawnWorker } from '../src/spawner.js';

test('protocol version is 0.1.0', () => {
  assert.equal(PROTOCOL_VERSION, '0.1.0');
});

test('encodeMessage appends newline', () => {
  const req: JobRequest = {
    type: 'job_request',
    jobId: 'j-test-1',
    capabilityId: 'test.cap',
    input: { foo: 'bar' },
  };
  const enc = encodeMessage(req);
  assert.ok(enc.endsWith('\n'));
  const parsed = JSON.parse(enc.trim());
  assert.equal(parsed.jobId, 'j-test-1');
  assert.equal(parsed.type, 'job_request');
});

test('decodeMessage handles valid and invalid messages', () => {
  const hs: WorkerHandshake = {
    type: 'handshake',
    workerId: 'w-1',
    capabilities: [{ capabilityId: 'cap1', version: '1.0' }],
    protocolVersion: '0.1.0',
    runtime: 'node',
    pid: 1234,
  };
  const decoded = decodeMessage(JSON.stringify(hs));
  assert.ok(decoded);
  assert.equal(decoded.type, 'handshake');

  assert.equal(decodeMessage(''), null);
  assert.equal(decodeMessage('   \n'), null);
  assert.equal(decodeMessage('{ bad json }'), null);
  assert.equal(decodeMessage('{"foo": "bar"}'), null); // no type property
});

test('type guards isJobRequest and isJobResponse', () => {
  const req: JobRequest = {
    type: 'job_request',
    jobId: 'j1',
    capabilityId: 'c1',
    input: {},
  };
  const res: JobResponse = {
    type: 'job_response',
    jobId: 'j1',
    ok: true,
    output: 'out',
    durationMs: 12,
    artifactRefs: [],
  };

  assert.equal(isJobRequest(req), true);
  assert.equal(isJobRequest(res), false);
  assert.equal(isJobResponse(res), true);
  assert.equal(isJobResponse(req), false);
});

test('spawner handles process early exit without hanging', async () => {
  // Spawn a node one-liner that exits immediately with code 42
  const worker = spawnWorker({
    command: process.execPath,
    args: ['-e', 'process.exit(42)'],
    workerId: 'quick-exit-worker',
  });

  const hsPromise = worker.waitHandshake(3000);
  const jobPromise = worker.submitJob({
    jobId: 'j-exit',
    capabilityId: 'test.noop',
    input: {},
  }, 3000);

  const [hs, jobRes] = await Promise.all([hsPromise, jobPromise]);

  assert.equal(hs, null, 'handshake should resolve to null on exit');
  assert.equal(jobRes.ok, false);
  assert.equal(jobRes.errorType, 'WORKER_EXITED');
  assert.match(jobRes.errorMessage ?? '', /42/);
  await worker.close();
});

test('spawner handles job timeout correctly', async () => {
  // Spawn a node process that sleeps and ignores input
  const worker = spawnWorker({
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    workerId: 'silent-worker',
  });

  try {
    const jobRes = await worker.submitJob({
      jobId: 'j-timeout',
      capabilityId: 'test.timeout',
      input: {},
    }, 200);

    assert.equal(jobRes.ok, false);
    assert.equal(jobRes.errorType, 'JOB_TIMEOUT');
    assert.match(jobRes.errorMessage ?? '', /timed out/);
  } finally {
    await worker.close();
  }
});
