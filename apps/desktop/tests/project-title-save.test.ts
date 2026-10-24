import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname, resolve } from 'node:path';
import { DesktopSidecarServer } from '../src-server/sidecar-server.js';
import { appHarness } from './helpers/app-harness.js';

test('the actual save handler persists and reopens a maximum-length Chinese title using a stable ID directory', async () => {
  const prefix = join(tmpdir(), 'pres-title-save-'), root = mkdtempSync(prefix);
  const token = 'project-title-save-session-'.repeat(3);
  const server = new DesktopSidecarServer({ port: 0, dataRoot: root, sessionToken: token });
  const base = `http://127.0.0.1:${await server.start()}`;
  const savedPaths: string[] = [];
  try {
    const app = appHarness({ dataRoot: root.replace(/\\/g, '/'), onRequest: async (route, body) => {
      if (route !== '/api/project/save') return undefined;
      const response = await fetch(base + route, { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result: any = await response.json();
      assert.equal(response.status, 200, result.error);
      savedPaths.push(body.projectJsonPath);
      return { ok: response.ok, json: async () => result };
    } });
    const title = '二〇二六年第四季度经营指标与预算执行情况专题汇报材料'.repeat(8).slice(0, 200);
    assert.equal(title.length, 200, 'Exercise the schema title boundary rather than a short fallback');
    app.props('HeaderBar').onTitleChange(title);
    const sourceText = app.props('MarkdownEditor').markdown;
    await app.props('HeaderBar').onSave();
    const firstPath = savedPaths[0];
    assert.ok(existsSync(firstPath));
    const first = JSON.parse(readFileSync(firstPath, 'utf8'));
    assert.equal(first.title, title);
    assert.equal(first.sourceDocument.content, sourceText);
    assert.equal(basename(dirname(firstPath)), first.projectId);
    assert.equal(resolve(firstPath), resolve(root, 'projects', first.projectId, 'pres-project.json'));
    assert.ok(basename(dirname(firstPath)).length <= 64);

    const reopen = await fetch(base + '/api/project/open', { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ projectJsonPath: firstPath }) });
    assert.equal(reopen.status, 200);
    assert.equal(((await reopen.json()) as any).project.title, title);
    app.props('HeaderBar').onTitleChange('改名后的项目');
    await app.props('HeaderBar').onSave();
    assert.equal(savedPaths[1], firstPath, 'Renaming changes metadata without relocating the project');
    assert.equal(JSON.parse(readFileSync(firstPath, 'utf8')).title, '改名后的项目');

    app.props('HeaderBar').onNew();
    app.props('HeaderBar').onTitleChange(title);
    await app.props('HeaderBar').onSave();
    assert.notEqual(savedPaths[2], firstPath, 'Same-title new projects remain isolated');
    assert.equal(JSON.parse(readFileSync(firstPath, 'utf8')).title, '改名后的项目');
    app.unmount();
  } finally {
    await server.stop();
    assert.ok(root.startsWith(prefix) && root !== tmpdir());
    rmSync(root, { recursive: true, force: true });
  }
});
