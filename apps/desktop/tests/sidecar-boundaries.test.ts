import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { DesktopSidecarServer } from '../src-server/sidecar-server.js';
import { DataPaths } from '../src-server/local-paths.js';
import { parseMarkdownToSlides, outlineToMarkdown } from '../src/outline.js';

test('same-origin session authentication and output boundaries reject untrusted requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-auth-'));
  const token = 'boundary-session-'.repeat(4);
  const server = new DesktopSidecarServer({ port: 0, dataRoot: dir, sessionToken: token });
  const port = await server.start(), base = `http://127.0.0.1:${port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await fetch(base + '/api/health')).status, 200);
    assert.equal((await fetch(base + '/api/session')).status, 401);
    const hostile = await post('/api/project/new', { title: 'X', projectId: 'x' }, { Origin: 'https://untrusted.example' });
    assert.equal(hostile.status, 403);
    assert.equal(hostile.headers.get('access-control-allow-origin'), null);
    const wrongHost = await new Promise<number | undefined>((done, reject) => {
      const req = request(base + '/api/health', { headers: { Host: 'untrusted.example' } }, res => { res.resume(); done(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(wrongHost, 403);
    assert.equal((await post('/api/project/save', { project: {}, projectJsonPath: join(dir, '..', 'outside.json') })).status, 400);
    const session = await fetch(base + '/api/session', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await session.json() as any).dataRoot, dir);
    const source = join(dir, 'source.pptx'), target = join(dir, 'existing.pptx');
    writeFileSync(source, 'original'); writeFileSync(target, 'user bytes');
    assert.equal((await post('/api/project/export', { sourcePptxPath: source, targetPptxPath: target })).status, 500);
    assert.equal(readFileSync(target, 'utf8'), 'user bytes');
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('local paths reject junction escape, aliases and Windows alternate data streams', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-paths-'));
  try {
    const paths = new DataPaths(dir);
    assert.throws(() => paths.file('../outside.json'), /outside/);
    symlinkSync(tmpdir(), join(dir, 'escape'), 'junction');
    assert.throws(() => paths.file(join(dir, 'escape', 'outside.json')), /links|junctions/);
    if (process.platform === 'win32') assert.throws(() => paths.file('source.json:hidden'), /alternate/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('outline editing keeps paragraphs, table rows and all H1 sections in source', () => {
  const markdown = '# First\nBudget -12.5万元\n\n| A | B |\n|---|---|\n|x|10,000家|\n# Second\nText';
  const slides = parseMarkdownToSlides(markdown);
  assert.equal(slides.length, 2);
  slides[0].title = 'Updated';
  const actual = outlineToMarkdown(slides);
  for (const text of ['# Updated', 'Budget -12.5万元', '|x|10,000家|', '# Second\nText']) assert.ok(actual.includes(text));
  slides[0].speakerNotes = 'Keep this narration';
  const renamed = parseMarkdownToSlides(actual.replace('# Updated', '# Renamed'), slides);
  assert.equal(renamed[0].speakerNotes, 'Keep this narration');
});

test('async cancellation reaches the workflow and leaves the service usable for a new task', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-cancel-api-'));
  const token = 'cancel-session-'.repeat(5);
  const server = new DesktopSidecarServer({ port: 0, dataRoot: dir, sessionToken: token });
  const port = await server.start(), base = `http://127.0.0.1:${port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const post = async (path: string, body: unknown) => {
    const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
    return { response, body: await response.json() as any };
  };
  try {
    const largeSource = '# Cancellable\n' + Array.from({ length: 180 }, (_, i) => `## Page ${i}\nBudget ${i}万元。\n`).join('\n');
    const started = await post('/api/project/compile', { projectId: 'cancel', markdown: largeSource,
      async: true, outPptxPath: join(dir, 'cancelled.pptx') });
    assert.equal(started.response.status, 202);
    const cancelled = await post('/api/task/cancel', { runId: started.body.sidecarRunId });
    assert.equal(cancelled.response.status, 200);
    let tracked: any;
    for (let i = 0; i < 100; i++) {
      const state: any = await (await fetch(base + '/api/task/status/' + started.body.sidecarRunId, { headers })).json();
      tracked = state.tracked;
      if (tracked?.result) break;
      await new Promise(done => setTimeout(done, 50));
    }
    assert.equal(tracked?.result?.status, 'CANCELLED');
    assert.equal(tracked.result.sourceContentPreserved, false);
    assert.equal(existsSync(join(dir, 'cancelled.pptx')), false);
    const next = await post('/api/project/compile', { projectId: 'next', markdown: '# Recovery\nBudget 37万元。',
      outPptxPath: join(dir, 'recovery.pptx') });
    assert.equal(next.body.ok, true, next.body.error);
    assert.equal(next.body.summary.contentVerification.ok, true);
    const terminalCancel = await post('/api/task/cancel', { runId: next.body.runId });
    assert.equal(terminalCancel.response.status, 409);
    assert.equal(server.getTaskService().getRun(next.body.runId)?.status, 'COMPLETED');
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});
