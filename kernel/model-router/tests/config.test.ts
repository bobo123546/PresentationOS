import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRouterConfig, loadRouterConfig, resolveApiKey } from '../src/config.js';

const base = {
  models: [
    { id: 'local.qwen', provider: 'ollama', model: 'qwen2.5:14b', baseUrl: 'http://localhost:11434', capabilities: ['deck.design'], local: true },
    { id: 'cloud.gpt4o', provider: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com', apiKeyRef: 'env:OPENAI_API_KEY', capabilities: ['narrative'] },
  ],
  routes: [{ capability: 'deck.design', models: ['local.qwen', 'cloud.gpt4o'] }],
};

test('合法配置通过', () => {
  const r = validateRouterConfig(base);
  assert.equal(r.ok, true);
  assert.equal(r.config?.models.length, 2);
  assert.equal(r.config?.routes.length, 1);
});

test('缺少 models 被拒绝', () => {
  const r = validateRouterConfig({ routes: base.routes });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(';').includes('models'));
});

test('缺少 routes 被拒绝', () => {
  const r = validateRouterConfig({ models: base.models });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(';').includes('routes'));
});

test('非法 baseUrl 被拒绝', () => {
  const r = validateRouterConfig({ ...base, models: [{ ...base.models[0], baseUrl: 'localhost:11434' }] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(';').includes('baseUrl'));
});

test('重复 model.id 被拒绝', () => {
  const r = validateRouterConfig({ ...base, models: [base.models[0], base.models[0]] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(';').includes('重复'));
});

test('重复 route 被拒绝', () => {
  const r = validateRouterConfig({ ...base, routes: [base.routes[0], base.routes[0]] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.join(';').includes('route 重复'));
});

test('空候选 models 被拒绝', () => {
  const r = validateRouterConfig({ ...base, routes: [{ capability: 'x', models: [] }] });
  assert.equal(r.ok, false);
});

test('loadRouterConfig 读取真实 yaml', () => {
  const r = loadRouterConfig('examples/models.yaml');
  assert.equal(r.ok, true);
  assert.equal(r.config?.models.length, 3);
  assert.equal(r.config?.routes.length, 4); // deck.design / narrative / vision.qa / research
});

test('apiKeyRef 解析（env: 形式）', () => {
  const prev = process.env.MY_TEST_KEY;
  process.env.MY_TEST_KEY = 'secret-value';
  assert.equal(resolveApiKey('env:MY_TEST_KEY'), 'secret-value');
  assert.equal(resolveApiKey('env:NOT_SET_ANYWHERE'), undefined);
  assert.equal(resolveApiKey(undefined), undefined);
  if (prev === undefined) delete process.env.MY_TEST_KEY;
  else process.env.MY_TEST_KEY = prev;
});
