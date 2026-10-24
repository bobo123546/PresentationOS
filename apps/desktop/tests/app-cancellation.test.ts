import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appHarness } from './helpers/app-harness.js';

test('cancel before compile acknowledgement waits for the real run ID and sends exactly once', async () => {
  const app = appHarness();
  const compilation = app.props('HeaderBar').onCompile();
  assert.equal(app.props('HeaderBar').status, 'RUNNING');
  await app.props('HeaderBar').onCancel();
  await app.props('HeaderBar').onCancel();
  assert.equal(app.requests.filter(request => request.route.endsWith('/cancel')).length, 0, 'No placeholder ID may be submitted while the 202 reply is pending');
  app.acknowledge(0);
  await compilation;
  const cancellations = app.requests.filter(request => request.route.endsWith('/cancel'));
  assert.equal(cancellations.length, 1);
  assert.equal(cancellations[0].body.runId, 'server-run-0');
  assert.equal(app.props('HeaderBar').status, 'CANCELLED');
  assert.equal(app.props('HeaderBar').hasPptx, false);
});

test('media export refuses source-chapter narration when final PPTX has extra pages', async () => {
  const app = appHarness({ compileResult: {
    ok: true, status: 'COMPLETED', runId: 'server-run-0', pptxPath: 'D:/isolated-data/deck.pptx',
    reportPath: 'D:/isolated-data/deck.json', slidesCount: 4, overallScore: 96, sourceContentPreserved: true,
    summary: { passed: true, contentVerification: { ok: true }, mechanical: { pass: true } },
  } });
  await app.props('HeaderBar').onCompile();
  assert.equal(app.props('HeaderBar').hasPptx, true);
  assert.equal(app.props('MarkdownEditor').slides.length, 3);
  await app.props('HeaderBar').onMediaExport();
  assert.equal(app.requests.some(request => request.route.startsWith('/api/media/')), false,
    'A three-chapter narration must not silently become a video for a four-page presentation');
});

test('queued cancellation is discarded after a failed start and cannot cancel the next compile', async () => {
  const app = appHarness();
  const first = app.props('HeaderBar').onCompile();
  await app.props('HeaderBar').onCancel();
  app.starts[0].resolve({ ok: false, json: async () => ({ error: 'Start refused' }) }); await first;
  assert.equal(app.props('HeaderBar').status, 'FAILED');
  assert.equal(app.requests.filter(request => request.route.endsWith('/cancel')).length, 0);
  const second = app.props('HeaderBar').onCompile();
  app.acknowledge(1); await second;
  assert.equal(app.requests.filter(request => request.route.endsWith('/cancel')).length, 0, 'An old pending intent must not reach a new task');
});

test('cancel after acknowledgement targets the server ID once and preserves terminal cancellation', async () => {
  const app = appHarness({ holdPolling: true });
  const compilation = app.props('HeaderBar').onCompile();
  app.acknowledge(0);
  await new Promise(done => setImmediate(done));
  assert.equal(app.polls.length, 1);
  await app.props('HeaderBar').onCancel();
  await app.props('HeaderBar').onCancel();
  assert.deepEqual(app.requests.filter(request => request.route.endsWith('/cancel')).map(request => request.body.runId), ['server-run-0']);
  app.polls[0].resolve({ ok: true, json: async () => ({ tracked: { status: 'CANCELLED', result: {} } }) });
  await compilation;
  assert.equal(app.props('HeaderBar').status, 'CANCELLED');
  await app.props('HeaderBar').onCancel();
  assert.equal(app.requests.filter(request => request.route.endsWith('/cancel')).length, 1);
});

test('a queued cancel cannot update an unmounted project or send after its pending start', async () => {
  const app = appHarness();
  const compilation = app.props('HeaderBar').onCompile();
  await app.props('HeaderBar').onCancel();
  app.unmount();
  app.acknowledge(0);
  await compilation;
  assert.equal(app.props('HeaderBar').status, 'RUNNING', 'An abandoned response cannot write a terminal state after unmount');
  assert.equal(app.requests.filter(request => request.route.endsWith('/cancel')).length, 0);
});

test('new, open and compile cannot replace an active compilation while cancellation is pending', async () => {
  const app = appHarness();
  const beforeTitle = app.props('HeaderBar').title;
  const compilation = app.props('HeaderBar').onCompile();
  await app.props('HeaderBar').onCancel();
  app.props('HeaderBar').onNew();
  await app.props('HeaderBar').onOpen();
  await app.props('HeaderBar').onCompile();
  assert.equal(app.props('HeaderBar').title, beforeTitle);
  assert.equal(app.starts.length, 1);
  assert.equal(app.requests.some(request => request.route === '/api/project/open'), false);
  app.acknowledge(0); await compilation;
  assert.equal(app.props('HeaderBar').status, 'CANCELLED');
  app.props('HeaderBar').onNew();
  assert.equal(app.props('HeaderBar').status, 'IDLE');
  assert.equal(app.props('HeaderBar').title, '新演示文稿');
  const next = app.props('HeaderBar').onCompile();
  app.acknowledge(1); await next;
  assert.equal(app.requests.filter(request => request.route.endsWith('/cancel')).length, 1, 'A completed cancellation cannot reach the next project');
});
