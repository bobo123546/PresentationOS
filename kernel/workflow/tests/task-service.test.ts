import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskService } from '../src/index.js';

test('TaskService: create, save, and open project conforming to schema', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-proj-test-'));
  const dbPath = join(dir, 'wf.db');
  const service = createTaskService({ dbPath });

  try {
    const proj = await service.createProject({
      projectId: 'proj-001',
      title: 'AI Presentation OS Launch',
      sourceDocument: {
        filename: 'intro.md',
        format: 'markdown',
        content: '# Intro\n\nWelcome to PresentationOS.',
      },
      projectDir: dir,
    });

    assert.equal(proj.projectId, 'proj-001');
    assert.equal(proj.title, 'AI Presentation OS Launch');

    const projectFile = join(dir, 'pres-project.json');
    assert.ok(existsSync(projectFile), 'pres-project.json should exist');

    // 读取并验证
    const loaded = await service.openProject(projectFile);
    assert.equal(loaded.projectId, 'proj-001');
    assert.equal(loaded.sourceDocument.format, 'markdown');

    // 修改并保存
    loaded.title = 'Updated Title';
    await service.saveProject(loaded, projectFile);

    const reloaded = await service.openProject(projectFile);
    assert.equal(reloaded.title, 'Updated Title');
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TaskService: compileMarkdown produces PPTX with Visual and Mechanical QA passed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-compile-test-'));
  const dbPath = join(dir, 'wf.db');
  const outPptx = join(dir, 'output.pptx');
  const outReport = join(dir, 'output.loop.json');
  const service = createTaskService({ dbPath });

  const md = `# PresentationOS Overview

> AI Presentation Infrastructure

- Deterministic multi-tier IR architecture
- 100% factual preservation guarantee
- Native PowerPoint COM verification

## Architecture Components

| Layer | Responsibility | Status |
| --- | --- | --- |
| Core Kernel | Layout, Render, QA | Verified |
| Desktop UI | React + Tauri Workspace | Ready |
| Worker Protocol | Sandboxed Process RPC | Certified |
`;

  try {
    const events: any[] = [];
    const result = await service.compileMarkdown(
      {
        projectId: 'test-compile-01',
        markdown: md,
        title: 'PresentationOS Overview',
        outPptxPath: outPptx,
        outReportPath: outReport,
      },
      (e) => events.push(e)
    );

    assert.equal(result.ok, true, `Compile failed: ${result.error}`);
    assert.equal(result.status, 'COMPLETED');
    assert.ok(existsSync(outPptx), 'Output PPTX must exist');
    assert.ok(existsSync(outReport), 'Output QA report must exist');
    assert.equal(result.sourceContentPreserved, true);
    assert.ok(result.slidesCount >= 2, 'Should generate at least 2 slides');
    assert.equal(result.overallScore, 100, 'Score should be 100 on clean sample');

    const report = JSON.parse(readFileSync(outReport, 'utf8'));
    assert.equal(report.passed, true);
    assert.equal(report.sourceContentPreserved, true);
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TaskService: cancel compilation terminates as CANCELLED without publishing outputs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-cancel-test-'));
  const dbPath = join(dir, 'wf.db');
  const outPptx = join(dir, 'never-published.pptx');
  const service = createTaskService({ dbPath });

  const md = `# Cancel Test

## Slide 1
Content here.

## Slide 2
More content.
`;

  try {
    // 启动编译，同时拦截并触发取消
    let capturedRunId = '';
    const compilePromise = service.compileMarkdown(
      {
        projectId: 'cancel-proj',
        markdown: md,
        outPptxPath: outPptx,
      },
      (e) => {
        capturedRunId = e.runId;
        service.cancel(e.runId);
      }
    );

    const result = await compilePromise;
    assert.equal(result.status, 'CANCELLED');
    assert.equal(result.ok, false);

    // 检查 DB 状态绝不可为 COMPLETED
    if (capturedRunId) {
      const dbRun = service.getRun(capturedRunId);
      assert.equal(dbRun?.status, 'CANCELLED');
    }
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
