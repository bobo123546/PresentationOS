import { test } from 'node:test';
import assert from 'node:assert/strict';

// PHASE 0 smoke test：验证 Node 运行时与项目根可加载
test('presentationos root smoke', async () => {
  const pkg = JSON.parse(
    await import('node:fs/promises').then(fs => fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'))
  );
  assert.equal(pkg.name, 'presentationos');
  assert.equal(pkg.version, '0.1.0-alpha');
});

test('node runtime is v22+', () => {
  const [major] = process.versions.node.split('.');
  assert.ok(Number(major) >= 22, `node major must be >=22, got ${major}`);
});
