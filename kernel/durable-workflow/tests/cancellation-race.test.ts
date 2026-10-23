import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkflowStore, WorkflowExecutor } from '../src/index.js';

test('BUG REPRODUCTION: cancel called while step handler is running must NOT be overwritten by COMPLETED', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-wf-race-'));
  const db = join(dir, 'wf.db');
  const store = new WorkflowStore(db);
  const ex = new WorkflowExecutor(store);

  try {
    let handlerStarted = false;
    let stepCompleted = false;

    ex.register({
      name: 'race-flow',
      steps: [
        {
          name: 'slow-step',
          handler: async () => {
            handlerStarted = true;
            // 模拟耗时任务
            await new Promise((resolve) => setTimeout(resolve, 80));
            stepCompleted = true;
            return { result: 42 };
          },
        },
      ],
    });

    const runId = await ex.start('race-flow', {});
    
    // 启动执行
    const runPromise = ex.run(runId);

    // 等待 handler 开始执行后发起取消
    while (!handlerStarted) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // 在 handler 执行期间取消
    ex.cancel(runId);
    assert.equal(store.getRun(runId)!.status, 'CANCELLED', 'Database should immediately be CANCELLED');

    // 等待 run 完成
    const finalResult = await runPromise;

    // 验证核心契约：已取消的 run 绝对不能以 COMPLETED 状态结束，也不能覆盖数据库状态！
    assert.equal(finalResult.status, 'CANCELLED', `Expected CANCELLED but got ${finalResult.status}`);
    const dbRun = store.getRun(runId)!;
    assert.equal(dbRun.status, 'CANCELLED', `Database status was overwritten by: ${dbRun.status}`);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BUG REPRODUCTION: crashed single-step IN_PROGRESS must be discovered by findResumable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-wf-crash-single-'));
  const db = join(dir, 'wf.db');
  const store = new WorkflowStore(db);
  const ex = new WorkflowExecutor(store);

  try {
    ex.register({
      name: 'single-step-crash',
      steps: [
        { name: 'only-step', handler: async () => ({ a: 1 }) },
      ],
    });

    const runId = await ex.start('single-step-crash', {});
    
    // 模拟在唯一步骤执行中崩溃：步骤为 IN_PROGRESS，没有其他 PENDING 步骤
    store.markStepInProgress(runId, 'only-step', 1, {});
    store.updateRunStatus(runId, 'RUNNING', 'only-step');

    // 检查 findResumable 是否能找到这个崩溃的 run
    const resumable = store.findResumable();
    const found = resumable.some((r) => r.runId === runId);
    assert.ok(found, 'findResumable MUST discover runs where active/only step is IN_PROGRESS when crashed');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
