import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

// Execute the actual App event handlers with deterministic hook state and delayed
// HTTP responses. This tests the request/state race, not browser or native UIA.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const response = (data: unknown, ok = true) => ({ ok, json: async () => data });
export function appHarness({ holdPolling = false, compileResult = undefined as any,
  onRequest = undefined as undefined | ((route: string, body: any) => any), promptResults = [] as Array<string | null> } = {}) {
  const states: any[] = [], refs: any[] = [], requests: Array<{ route: string; body: any }> = [];
  const starts: Array<ReturnType<typeof deferred<any>>> = [];
  const polls: Array<ReturnType<typeof deferred<any>>> = [];
  let stateIndex = 0, refIndex = 0, cancelled = false;
  let effectRegistered = false, cleanup: undefined | (() => void);
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
    useEffect: (effect: () => (() => void) | undefined) => { if (!effectRegistered) { effectRegistered = true; cleanup = effect(); } },
  };
  const apiFetch = async (route: string, init: any = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ route, body });
    if (route === '/api/session') return response({ dataRoot: 'D:/isolated-data' });
    if (onRequest) { const handled = onRequest(route, body); if (handled !== undefined) return await handled; }
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
      window: { prompt: () => promptResults.shift() ?? null },
      crypto: webcrypto, TextEncoder, btoa,
    })(requireModule, module, module.exports);
    return module.exports;
  }
  const outline = load(resolve('src/outline.ts'), () => { throw Error('Unexpected outline import'); });
  const importAssets = load(resolve('src/import-assets.ts'), () => { throw Error('Unexpected asset import'); });
  const { App } = load(resolve('src/App.tsx'), name => {
    if (name === 'react') return react;
    if (name === './api.js') return { apiFetch };
    if (name === './outline.js') return outline;
    if (name === './import-assets.js') return importAssets;
    if (name.startsWith('./components/')) { const component = name.split('/').pop()!.replace('.js', ''); return { [component]: { component } }; }
    throw Error(`Unexpected module ${name}`);
  });
  function render() { stateIndex = 0; refIndex = 0; return App(); }
  function props(component: string, tree: any = render()): any {
    if (tree?.type?.component === component) return tree.props;
    for (const child of (tree?.props?.children ?? []).flat()) { const found = props(component, child); if (found) return found; }
  }
  return { props, starts, polls, requests, unmount: () => cleanup?.(), acknowledge: (index: number) => starts[index].resolve(response({ status: 'RUNNING', sidecarRunId: `server-run-${index}` })) };
}
