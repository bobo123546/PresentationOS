import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, loadManifest } from '../src/manifest.js';

const base = {
  name: 'demo',
  version: '0.1.0',
  type: 'safe',
  permissions: ['filesystem.read'],
  entry: 'index.mjs',
};

test('合法 manifest 通过校验', () => {
  const r = validateManifest({ ...base });
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
  assert.equal(r.manifest?.name, 'demo');
});

test('缺少 permissions 被拒绝', () => {
  const r = validateManifest({ ...base, permissions: undefined });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(';').includes('permissions'));
});

test('未知权限被拒绝', () => {
  const r = validateManifest({ ...base, permissions: ['filesystem.read', 'sudo'] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(';').includes('未知权限'));
});

test('重复权限被拒绝', () => {
  const r = validateManifest({ ...base, permissions: ['filesystem.read', 'filesystem.read'] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(';').includes('重复权限'));
});

test('safe 插件声明非受限权限被拒绝（须用 privileged）', () => {
  const r = validateManifest({ ...base, permissions: ['network'] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(';').includes('safe 插件不允许'));
});

test('非法 type 被拒绝', () => {
  const r = validateManifest({ ...base, type: 'wasm' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(';').includes('safe 或 privileged'));
});

test('非法 name 被拒绝', () => {
  const r = validateManifest({ ...base, name: 'Hello World' });
  assert.equal(r.ok, false);
});

test('privileged 可声明任意权限', () => {
  const r = validateManifest({
    ...base,
    type: 'privileged',
    permissions: ['process', 'powerpoint', 'gpu'],
    capability: 'plugin.demo.p',
  });
  assert.equal(r.ok, true);
  assert.equal(r.manifest?.capability, 'plugin.demo.p');
});

test('loadManifest 读取真实 plugin.yaml', () => {
  const r = loadManifest('examples/plain-text-tools');
  assert.equal(r.ok, true);
  assert.equal(r.manifest?.name, 'plain-text-tools');
  assert.equal(r.manifest?.type, 'safe');
});

test('loadManifest 缺文件报错', () => {
  const r = loadManifest('examples/__not_exists__');
  assert.equal(r.ok, false);
});
