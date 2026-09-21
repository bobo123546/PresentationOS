import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowStore, WorkflowExecutor } from '../src/index.js';
function fresh() {
    const dir = mkdtempSync(join(tmpdir(), 'pres-wf-'));
    const db = join(dir, 'wf.db');
    const store = new WorkflowStore(db);
    const ex = new WorkflowExecutor(store);
    return { store, ex, dir, db };
}
test('two-step workflow completes with checkpoint', async () => {
    const { store, ex, dir } = fresh();
    try {
        ex.register({
            name: 'demo',
            steps: [
                { name: 'step1', handler: async (i) => ({ doubled: i.x * 2 }) },
                { name: 'step2', handler: async (i) => ({ message: `final=${i.doubled}` }) },
            ],
        });
        const runId = await ex.start('demo', { x: 21 });
        const r = await ex.run(runId);
        assert.equal(r.status, 'COMPLETED');
        const steps = store.steps(runId);
        assert.equal(steps.length, 2);
        assert.ok(steps.every((s) => s.status === 'COMPLETED'));
        assert.equal(JSON.parse(steps[1].outputJson).message, 'final=42');
        assert.equal(store.getRun(runId).status, 'COMPLETED');
    }
    finally {
        store.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
test('failed step marks run FAILED and records error', async () => {
    const { store, ex, dir } = fresh();
    try {
        ex.register({
            name: 'failflow',
            steps: [
                { name: 's1', handler: async () => { throw new Error('boom-in-step'); } },
            ],
        });
        const runId = await ex.start('failflow', {});
        const r = await ex.run(runId);
        assert.equal(r.status, 'FAILED');
        assert.equal(r.failedStep, 's1');
        assert.match(r.error ?? '', /boom-in-step/);
        assert.equal(store.getRun(runId).status, 'FAILED');
    }
    finally {
        store.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
test('resume after crash: completed steps skipped, failed retried', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pres-wf-'));
    const db = join(dir, 'wf.db');
    try {
        let attempts = 0;
        const store1 = new WorkflowStore(db);
        const ex1 = new WorkflowExecutor(store1);
        ex1.register({
            name: 'retryflow',
            steps: [
                { name: 'a', handler: async (i) => ({ v: i.v + 1 }) },
                { name: 'b', handler: async () => { attempts++; if (attempts === 1)
                        throw new Error('first-fail'); return { ok: true }; } },
            ],
        });
        const runId = await ex1.start('retryflow', { v: 1 });
        const r1 = await ex1.run(runId);
        assert.equal(r1.status, 'FAILED');
        store1.close();
        // 模拟进程重启：重新打开同一 db，再次 run → 应从步骤 b 继续（a 已 COMPLETED 跳过）
        const store2 = new WorkflowStore(db);
        const ex2 = new WorkflowExecutor(store2);
        ex2.register({
            name: 'retryflow',
            steps: [
                { name: 'a', handler: async (i) => ({ v: i.v + 1 }) },
                { name: 'b', handler: async () => ({ ok: true }) },
            ],
        });
        const r2 = await ex2.run(runId);
        assert.equal(r2.status, 'COMPLETED');
        const steps = store2.steps(runId);
        assert.equal(steps[0].status, 'COMPLETED'); // a 跳过未重跑
        assert.equal(steps[1].status, 'COMPLETED'); // b 重试成功
        assert.equal(steps[1].attempt, 2);
        store2.close();
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('cancel marks run CANCELLED', async () => {
    const { store, ex, dir } = fresh();
    try {
        ex.register({
            name: 'cancelme',
            steps: [{ name: 's1', handler: async () => ({ done: true }) }],
        });
        const runId = await ex.start('cancelme', {});
        ex.cancel(runId);
        assert.equal(store.getRun(runId).status, 'CANCELLED');
        const r = await ex.run(runId);
        assert.equal(r.status, 'CANCELLED');
    }
    finally {
        store.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
test('pause via shouldPause then continue', async () => {
    const { store, ex, dir } = fresh();
    try {
        let paused = false;
        const ex2 = new WorkflowExecutor(store, {
            shouldPause: (stepName) => stepName === 's2' && !paused,
        });
        ex2.register({
            name: 'pauseflow',
            steps: [
                { name: 's1', handler: async () => ({ a: 1 }) },
                { name: 's2', handler: async () => ({ b: 2 }) },
                { name: 's3', handler: async () => ({ c: 3 }) },
            ],
        });
        const runId = await ex2.start('pauseflow', {});
        const r1 = await ex2.run(runId);
        assert.equal(r1.status, 'PAUSED');
        assert.equal(store.getRun(runId).status, 'PAUSED');
        // 取消暂停条件后续跑
        paused = true;
        const r2 = await ex2.run(runId);
        assert.equal(r2.status, 'COMPLETED');
    }
    finally {
        store.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
