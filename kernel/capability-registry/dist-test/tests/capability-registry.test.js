// Capability ABI 测试：同一 Contract 两个 Provider、fallback、Graph 拓扑
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry, CapabilityGraph } from '../src/index.js';
const validInput = (i) => typeof i?.text === 'string';
// Provider A：大写转换（主，priority 10）
const upperProvider = {
    id: 'text.transform.upper',
    version: '1.0.0',
    validateInput(i) { return validInput(i) ? { valid: true, errors: [] } : { valid: false, errors: ['text required'] }; },
    async execute(input) {
        if (input.text === 'boom')
            return { ok: false, output: null, errorType: 'PROVIDER_BOOM', errorMessage: 'upper exploded', durationMs: 1, artifactRefs: [] };
        return { ok: true, output: { text: input.text.toUpperCase() }, durationMs: 1, artifactRefs: [] };
    },
    validateOutput(o) { return typeof o?.text === 'string' ? { valid: true, errors: [] } : { valid: false, errors: ['text required'] }; },
};
// Provider B：小写转换（备，priority 20）
const lowerProvider = {
    id: 'text.transform.lower',
    version: '1.0.0',
    validateInput(i) { return validInput(i) ? { valid: true, errors: [] } : { valid: false, errors: ['text required'] }; },
    async execute(input) {
        return { ok: true, output: { text: input.text.toLowerCase() }, durationMs: 1, artifactRefs: [] };
    },
    validateOutput(o) { return typeof o?.text === 'string' ? { valid: true, errors: [] } : { valid: false, errors: ['text required'] }; },
};
const ctx = { traceId: 'trc-cap-1' };
test('registry resolves highest priority provider', async () => {
    const reg = new CapabilityRegistry();
    reg.register({ capabilityId: 'text.transform', providerId: 'upper', provider: upperProvider, priority: 10, runtime: 'node' });
    reg.register({ capabilityId: 'text.transform', providerId: 'lower', provider: lowerProvider, priority: 20, runtime: 'node' });
    const r = await reg.execute('text.transform', { text: 'hello' }, ctx);
    assert.equal(r.ok, true);
    assert.equal(r.output?.text, 'HELLO');
});
test('fallback to second provider when primary fails', async () => {
    const reg = new CapabilityRegistry();
    reg.register({ capabilityId: 'text.transform', providerId: 'upper', provider: upperProvider, priority: 10, runtime: 'node' });
    reg.register({ capabilityId: 'text.transform', providerId: 'lower', provider: lowerProvider, priority: 20, runtime: 'node' });
    // upper 对 'boom' 失败 → 应 fallback 到 lower
    const r = await reg.execute('text.transform', { text: 'boom' }, ctx);
    assert.equal(r.ok, true);
    assert.equal(r.output?.text, 'boom');
});
test('fallback disabled returns failure', async () => {
    const reg = new CapabilityRegistry();
    reg.register({ capabilityId: 'text.transform', providerId: 'upper', provider: upperProvider, priority: 10, runtime: 'node' });
    reg.register({ capabilityId: 'text.transform', providerId: 'lower', provider: lowerProvider, priority: 20, runtime: 'node' });
    const r = await reg.execute('text.transform', { text: 'boom' }, ctx, { fallback: false });
    assert.equal(r.ok, false);
    assert.equal(r.errorType, 'ALL_PROVIDERS_FAILED');
});
test('invalid input rejected before execution', async () => {
    const reg = new CapabilityRegistry();
    reg.register({ capabilityId: 'text.transform', providerId: 'upper', provider: upperProvider, priority: 10, runtime: 'node' });
    const r = await reg.execute('text.transform', { text: 42 }, ctx);
    assert.equal(r.ok, false);
});
test('explicit providerId selection', async () => {
    const reg = new CapabilityRegistry();
    reg.register({ capabilityId: 'text.transform', providerId: 'upper', provider: upperProvider, priority: 10, runtime: 'node' });
    reg.register({ capabilityId: 'text.transform', providerId: 'lower', provider: lowerProvider, priority: 20, runtime: 'node' });
    const r = await reg.execute('text.transform', { text: 'HeLLo' }, ctx, { providerId: 'lower' });
    assert.equal(r.output?.text, 'hello');
});
test('health gate excludes unhealthy provider', async () => {
    const reg = new CapabilityRegistry();
    reg.register({ capabilityId: 'text.transform', providerId: 'upper', provider: upperProvider, priority: 10, runtime: 'node' });
    reg.register({ capabilityId: 'text.transform', providerId: 'lower', provider: lowerProvider, priority: 20, runtime: 'node' });
    reg.setHealth('text.transform', 'upper', false);
    const r = await reg.execute('text.transform', { text: 'HI' }, ctx);
    assert.equal(r.output?.text, 'hi');
});
test('graph topo order and resolve chain', () => {
    const g = new CapabilityGraph();
    g.add({ id: 'pptx.render', version: '1', dependsOn: ['layout.resolve'], fallbacks: [], runtime: 'node', permissions: ['filesystem.write'], providers: [{ providerId: 'pptxgenjs', version: '3' }] });
    g.add({ id: 'layout.resolve', version: '1', dependsOn: ['deck.plan'], fallbacks: [], runtime: 'node', permissions: [], providers: [{ providerId: 'layout-engine', version: '1' }] });
    g.add({ id: 'deck.plan', version: '1', dependsOn: [], fallbacks: [], runtime: 'node', permissions: [], providers: [{ providerId: 'narrative', version: '1' }] });
    const order = g.topoSort();
    assert.deepEqual(order, ['deck.plan', 'layout.resolve', 'pptx.render']);
    assert.deepEqual(g.resolveChain('pptx.render'), ['deck.plan', 'layout.resolve', 'pptx.render']);
});
test('graph cycle detected', () => {
    const g = new CapabilityGraph();
    g.add({ id: 'a', version: '1', dependsOn: ['b'], fallbacks: [], runtime: 'node', permissions: [], providers: [] });
    g.add({ id: 'b', version: '1', dependsOn: ['a'], fallbacks: [], runtime: 'node', permissions: [], providers: [] });
    assert.equal(g.topoSort(), null);
});
