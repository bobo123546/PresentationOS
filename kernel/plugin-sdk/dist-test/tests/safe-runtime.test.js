import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSafePlugin } from '../src/safe-runtime.js';
function makePlugin(code, perms) {
    const dir = join(tmpdir(), `plug-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.mjs'), code, 'utf8');
    const manifest = { name: 't', version: '0.1.0', type: 'safe', permissions: perms, entry: 'index.mjs' };
    return { dir, manifest };
}
test('纯计算 safe 插件（无权限）执行成功', async () => {
    const { dir, manifest } = makePlugin('async function run(input){ return { sum: input.a + input.b }; }', []);
    const r = await runSafePlugin({ manifest, rootDir: dir }, { a: 2, b: 3 });
    assert.equal(r.ok, true);
    const out = r.output;
    assert.equal(out.sum, 5);
});
test('filesystem.read 插件读取目录内文件成功', async () => {
    const { dir, manifest } = makePlugin(`async function run(input){ const t = fs.readText('note.txt'); return { len: t.length }; }`, ['filesystem.read']);
    writeFileSync(join(dir, 'note.txt'), 'hello world', 'utf8');
    const r = await runSafePlugin({ manifest, rootDir: dir }, {});
    assert.equal(r.ok, true);
    const out = r.output;
    assert.equal(out.len, 11);
});
test('权限门：未声明 filesystem 时 fs 不可用（运行失败）', async () => {
    const { dir, manifest } = makePlugin(`async function run(input){ const t = fs.readText('note.txt'); return { len: t.length }; }`, []);
    writeFileSync(join(dir, 'note.txt'), 'x', 'utf8');
    const r = await runSafePlugin({ manifest, rootDir: dir }, {});
    assert.equal(r.ok, false);
    assert.ok(r.error && r.error.includes('fs'));
});
test('路径逃逸被拒绝', async () => {
    const { dir, manifest } = makePlugin(`async function run(input){ try { fs.readText('../secret.txt'); return { escaped: false }; } catch (e) { return { escaped: true, msg: e.message }; } }`, ['filesystem.read']);
    const r = await runSafePlugin({ manifest, rootDir: dir }, {});
    assert.equal(r.ok, true);
    const out = r.output;
    assert.equal(out.escaped, true);
    assert.ok(String(out.msg).includes('逃逸'));
});
test('filesystem.write 声明后可写插件目录内文件', async () => {
    const { dir, manifest } = makePlugin(`async function run(input){ fs.writeText('out.txt', input.data); return { wrote: true }; }`, ['filesystem.read', 'filesystem.write']);
    const r = await runSafePlugin({ manifest, rootDir: dir }, { data: 'abc' });
    assert.equal(r.ok, true);
    assert.equal(readFileSync(join(dir, 'out.txt'), 'utf8'), 'abc');
    rmSync(dir, { recursive: true, force: true });
});
