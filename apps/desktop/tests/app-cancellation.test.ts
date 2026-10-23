import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual App event handlers with deterministic hook state and delayed
// HTTP responses. This tests the request/state race, not browser or native UIA.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const response = (data: unknown, ok = true) => ({ ok, json: async () => data });
function appHarness({ holdPolling = false, compileResult = undefined as any } = {}) {
  const states: any[] = [], refs: any[] = [], requests: Array<{ route: string; body: any }> = [];
  const starts: Array<ReturnType<typeof deferred<any>>> = [];
  const polls: Array<ReturnType<typeof deferred<any>>> = [];
  let stateIndex = 0, refIndex = 0, cancelled = false;
  const react = {
    __esModule: true,
    default: { createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }) },
    useState: (initial: any) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = index === 0 ? 'D:/isolated-data' : typeof initial === 'function' ? initial() : initial;
      return [states[index], (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef: (initial: any) => { const index = refIndex++; refs[index] ??= { current: initial }; return refs[index]; },
    useCallback: (callback: any) => callback,
    useEffect: () => {},
  };
  const apiFetch = async (route: string, init: any = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ route, body });
    if (route.endsWith('/compile')) {
      if (compileResult) return response(compileResult);
      cancelled = false;
      const start = deferred<any>(); starts.push(start); return start.promise;
    }
    if (route.endsWith('/cancel')) {
      if (!body.runId.startsWith('server-run-')) return response({ error: 'Task not found' }, false);
      cancelled = true; return response({ success: true });
    }
    if (route.startsWith('/api/task/status/')) {
      if (holdPolling) { const poll = deferred<any>(); polls.push(poll); return poll.promise; }
      return response({ tracked: { status: cancelled ? 'CANCELLED' : 'FAILED', result: { error: 'not cancelled' } } });
    }
    throw Error(`Unexpected route ${route}`);
  };
  function load(path: string, requireModule: (name: string) => any) {
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} as any };
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
      console, setTimeout: (callback: () => void, delay: number) => { if (delay < 1000) queueMicrotask(callback); return 0; },
      window: { prompt: () => null },
    })(requireModule, module, module.exports);
    return module.exports;
  }
  const outline = load(resolve('src/outline.ts'), () => { throw Error('Unexpected outline import'); });
  const { App } = load(resolve('src/App.tsx'), name => {
    if (name === 'react') return react;
    if (name === './api.js') return { apiFetch };
    if (name === './outline.js') return outline;
    if (name.startsWith('./components/')) { const component = name.split('/').pop()!.replace('.js', ''); return { [component]: { component } }; }
    throw Error(`Unexpected module ${name}`);
  });
  function render() { stateIndex = 0; refIndex = 0; return App(); }
  function props(component: string, tree: any = render()): any {
    if (tree?.type?.component === component) return tree.props;
    for (const child of (tree?.props?.children ?? []).flat()) { const found = props(component, child); if (found) return found; }
  }
  return { props, starts, polls, requests, acknowledge: (index: number) => starts[index].resolve(response({ status: 'RUNNING', sidecarRunId: `server-run-${index}` })) };
}

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
  app.starts[0].resolve(response({ error: 'Start refused' }, false)); await first;
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
  app.polls[0].resolve(response({ tracked: { status: 'CANCELLED', result: {} } }));
  await compilation;
  assert.equal(app.props('HeaderBar').status, 'CANCELLED');
  await app.props('HeaderBar').onCancel();
  assert.equal(app.requests.filter(request => request.route.endsWith('/cancel')).length, 1);
});

test('a queued cancel cannot update or cancel a project that replaced its pending start', async () => {
  const app = appHarness();
  const compilation = app.props('HeaderBar').onCompile();
  await app.props('HeaderBar').onCancel();
  app.props('HeaderBar').onNew();
  app.acknowledge(0);
  await compilation;
  assert.equal(app.props('HeaderBar').status, 'IDLE');
  assert.equal(app.requests.filter(request => request.route.endsWith('/cancel')).length, 0);
});
