import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginRegistry } from '../src/registry.js';

const SAFE_DIR = 'examples/plain-text-tools';
const ECHO_DIR = 'examples/echo-worker';

test('registry 注册 safe 插件并执行', async () => {
  const reg = new PluginRegistry();
  const r = reg.register(SAFE_DIR);
  assert.equal(r.ok, true);
  assert.equal(reg.has('plain-text-tools'), true);
  const res = await reg.runSafe('plain-text-tools', {
    text: '# 标题一\n正文\n## 标题二\n再一行',
  });
  assert.equal(res.ok, true);
  const out = res.output as { headings: string[]; wordCount: number; lineCount: number };
  // vm realm 数组原型不同，deepStrictEqual 会误判；用 JSON 比较
  assert.equal(JSON.stringify(out.headings), JSON.stringify(['标题一', '标题二']));
  assert.equal(out.wordCount, 6); // ['#','标题一','正文','##','标题二','再一行']
  assert.equal(out.lineCount, 4);
  await reg.shutdown();
});

test('registry 注册 privileged 插件并经 worker-protocol 通信', async () => {
  const reg = new PluginRegistry();
  const r = reg.register(ECHO_DIR);
  assert.equal(r.ok, true);
  const caps = reg.list().filter((p) => p.type === 'privileged');
  assert.equal(caps.length, 1);
  assert.equal(caps[0].capabilityId, 'plugin.demo.echo');

  const resp = await reg.callPrivileged('echo-worker', { jobId: 'j-1', input: { text: '你好' } });
  assert.equal(resp.ok, true);
  const out = resp.output as { echo?: string; capabilityId?: string };
  assert.equal(out.echo, '你好');
  assert.equal(out.capabilityId, 'plugin.demo.echo');
  await reg.shutdown();
});

test('registry 拒绝重复注册', () => {
  const reg = new PluginRegistry();
  reg.register(SAFE_DIR);
  const r = reg.register(SAFE_DIR);
  assert.equal(r.ok, false);
  assert.ok(r.error!.includes('已存在'));
});

test('registry 校验失败插件被拒绝', () => {
  const reg = new PluginRegistry();
  const r = reg.register('examples/__bad_plugin__');
  assert.equal(r.ok, false);
});

test('调用不存在的 privileged 插件返回错误', async () => {
  const reg = new PluginRegistry();
  const resp = await reg.callPrivileged('no-such', { jobId: 'j-x', input: {} });
  assert.equal(resp.ok, false);
  assert.ok(resp.errorMessage!.includes('不存在'));
});
