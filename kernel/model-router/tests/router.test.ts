import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { ModelRouter } from '../src/router.js';
import type { RouterConfig } from '../src/types.js';

function makeConfig(primaryPort: number, fallbackPort: number, primaryFails = false): RouterConfig {
  return {
    models: [
      { id: 'm1', provider: 'openai', model: 'm1-model', baseUrl: `http://127.0.0.1:${primaryPort}`, capabilities: ['deck.design'], local: false, timeoutMs: 2000 },
      { id: 'm2', provider: 'openai', model: 'm2-model', baseUrl: `http://127.0.0.1:${fallbackPort}`, capabilities: ['deck.design'], local: false, timeoutMs: 2000 },
    ],
    routes: [{ capability: 'deck.design', models: ['m1', 'm2'] }],
  };
}

function startMock(handler: (req: import('node:http').IncomingMessage, body: string) => { status: number; body: unknown }): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      const r = handler(req, data);
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r.body));
    });
  });
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolvePromise({ server, port: typeof addr === 'object' && addr ? addr.port : 0 });
    });
  });
}

const okBody = (model: string) => ({ choices: [{ message: { content: `answer from ${model}` } }] });

test('路由成功：主模型返回内容', async () => {
  const s1 = await startMock((_req, _body) => ({ status: 200, body: okBody('m1') }));
  const s2 = await startMock((_req, _body) => ({ status: 200, body: okBody('m2') }));
  try {
    const router = new ModelRouter(makeConfig(s1.port, s2.port));
    const d = await router.route('deck.design', [{ role: 'user', content: 'hi' }]);
    assert.equal(d.final.ok, true);
    assert.equal(d.final.content, 'answer from m1');
    assert.equal(d.fallbackUsed, false);
    assert.equal(d.attempted.length, 1);
  } finally {
    s1.server.close();
    s2.server.close();
  }
});

test('主模型失败自动回退到备选', async () => {
  const s1 = await startMock((_req, _body) => ({ status: 500, body: { error: 'boom' } }));
  const s2 = await startMock((_req, _body) => ({ status: 200, body: okBody('m2') }));
  try {
    const router = new ModelRouter(makeConfig(s1.port, s2.port));
    const d = await router.route('deck.design', [{ role: 'user', content: 'hi' }]);
    assert.equal(d.final.ok, true);
    assert.equal(d.final.content, 'answer from m2');
    assert.equal(d.fallbackUsed, true);
    assert.equal(d.attempted.length, 2);
    assert.equal(d.attempted[0].ok, false);
  } finally {
    s1.server.close();
    s2.server.close();
  }
});

test('401 未授权被识别（不泄漏 key）', async () => {
  const s1 = await startMock((_req, _body) => ({ status: 401, body: { error: 'invalid key' } }));
  const s2 = await startMock((_req, _body) => ({ status: 401, body: { error: 'invalid key' } }));
  try {
    const router = new ModelRouter(makeConfig(s1.port, s2.port));
    const d = await router.route('deck.design', [{ role: 'user', content: 'hi' }]);
    assert.equal(d.final.ok, false);
    assert.equal(d.final.errorType, 'UNAUTHORIZED');
    assert.equal(d.attempted.length, 2);
  } finally {
    s1.server.close();
    s2.server.close();
  }
});

test('全部失败返回最终错误', async () => {
  const s1 = await startMock((_req, _body) => ({ status: 503, body: {} }));
  const s2 = await startMock((_req, _body) => ({ status: 503, body: {} }));
  try {
    const router = new ModelRouter(makeConfig(s1.port, s2.port));
    const d = await router.route('deck.design', [{ role: 'user', content: 'hi' }]);
    assert.equal(d.final.ok, false);
    assert.equal(d.attempted.length, 2);
  } finally {
    s1.server.close();
    s2.server.close();
  }
});

test('无候选模型返回 NO_MODEL', async () => {
  const router = new ModelRouter({ models: [], routes: [] });
  const d = await router.route('deck.design', [{ role: 'user', content: 'hi' }]);
  assert.equal(d.final.ok, false);
  assert.equal(d.final.errorType, 'NO_MODEL');
});

test('请求包含 Authorization 头（key 来自 env）', async () => {
  let auth: string | undefined;
  const s1 = await startMock((req, _body) => {
    auth = req.headers.authorization;
    return { status: 200, body: okBody('m1') };
  });
  const s2 = await startMock((_req, _body) => ({ status: 200, body: okBody('m2') }));
  const prev = process.env.ROUTER_TEST_KEY;
  process.env.ROUTER_TEST_KEY = 'k123';
  try {
    const cfg = makeConfig(s1.port, s2.port);
    cfg.models[0].apiKeyRef = 'env:ROUTER_TEST_KEY';
    const router = new ModelRouter(cfg);
    await router.route('deck.design', [{ role: 'user', content: 'hi' }]);
    assert.equal(auth, 'Bearer k123');
  } finally {
    s1.server.close();
    s2.server.close();
    if (prev === undefined) delete process.env.ROUTER_TEST_KEY;
    else process.env.ROUTER_TEST_KEY = prev;
  }
});
