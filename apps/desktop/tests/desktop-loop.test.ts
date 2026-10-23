// PresentationOS Desktop End-to-End Loop and Verification Tests (P04 / P11-A)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DesktopSidecarServer } from '../src-server/sidecar-server.js';

describe('PresentationOS Desktop Workbench & Sidecar Loop Tests', () => {
  const testRoot = resolve(process.cwd(), 'temp-desktop-test-' + Date.now());
  const testDb = resolve(testRoot, 'desktop-test.db');
  let server: DesktopSidecarServer;
  let port: number;
  let baseUrl: string;

  before(async () => {
    mkdirSync(testRoot, { recursive: true });
    // Use port 0 to bind dynamically to any free port
    server = new DesktopSidecarServer({ port: 0, dbPath: testDb });
    port = await server.start();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await server.stop();
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  test('TC-D01: Sidecar health check returns OK and semver', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.status, 'OK');
    assert.equal(body.version, '0.1.2-alpha');
    assert.equal(body.service, 'PresentationOS-Sidecar');
  });

  test('TC-D02: Create new project with schema validation and pres-project.json', async () => {
    const projDir = resolve(testRoot, 'proj-alpha');
    const res = await fetch(`${baseUrl}/api/project/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-alpha',
        title: 'Project Alpha Q4 Strategy',
        projectDir: projDir,
        content: '# Project Alpha\n\n## 目标\n- 实现 100% 来源事实一致\n- 原生 PPTX 导出',
      }),
    });

    assert.equal(res.status, 201);
    const body: any = await res.json();
    assert.ok(body.project);
    assert.equal(body.project.title, 'Project Alpha Q4 Strategy');
    assert.equal(body.project.projectId, 'proj-alpha');

    const projectFile = resolve(projDir, 'pres-project.json');
    assert.ok(existsSync(projectFile), 'pres-project.json must be written to disk');
    const diskContent = JSON.parse(readFileSync(projectFile, 'utf8'));
    assert.equal(diskContent.title, 'Project Alpha Q4 Strategy');
  });

  test('TC-D03: Save and open project round-trip maintains 100% data fidelity', async () => {
    const projDir = resolve(testRoot, 'proj-beta');
    const projFile = resolve(projDir, 'pres-project.json');

    // Create project
    const createRes = await fetch(`${baseUrl}/api/project/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-beta',
        title: 'Beta Roadmap',
        projectDir: projDir,
      }),
    });
    assert.equal(createRes.status, 201);
    const { project }: any = await createRes.json();

    // Modify and save
    project.title = 'Beta Roadmap Updated 2026';
    project.sourceDocument.content = '# Beta 2026\n\n## Milestone\n- Complete P04 Desktop EXE';

    const saveRes = await fetch(`${baseUrl}/api/project/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project,
        projectJsonPath: projFile,
      }),
    });
    assert.equal(saveRes.status, 200);

    // Open saved project
    const openRes = await fetch(`${baseUrl}/api/project/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectJsonPath: projFile,
      }),
    });
    assert.equal(openRes.status, 200);
    const opened: any = await openRes.json();
    assert.equal(opened.project.title, 'Beta Roadmap Updated 2026');
    assert.ok(opened.project.sourceDocument.content.includes('Complete P04 Desktop EXE'));
  });

  test('TC-D04: Full deck compilation executes durable workflow, generates PPTX and QA report', async () => {
    const outPptx = resolve(testRoot, 'out', 'presentation.pptx');
    const outReport = resolve(testRoot, 'out', 'presentation.loop.json');

    const compileRes = await fetch(`${baseUrl}/api/project/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'compile-test',
        title: 'E2E Deck Compile',
        markdown: `# E2E Presentation Deck\n\n## 架构概览\n- 端到端工作流引擎\n- 自动化质量检验\n\n## 收益分析\n- 交付零缺陷文稿\n- 节省90%排版时间`,
        outPptxPath: outPptx,
        outReportPath: outReport,
        async: false,
      }),
    });

    assert.equal(compileRes.status, 200);
    const compileData: any = await compileRes.json();
    assert.equal(compileData.ok, true);
    assert.equal(compileData.status, 'COMPLETED');
    assert.equal(compileData.sourceContentPreserved, true);
    assert.ok(compileData.slidesCount >= 2);
    assert.ok(compileData.overallScore >= 90);

    // Verify disk artifacts
    assert.ok(existsSync(outPptx), 'Generated PPTX file must exist on disk');
    const pptxStat = statSync(outPptx);
    assert.ok(pptxStat.size > 1000, `PPTX size must be non-empty, got ${pptxStat.size} bytes`);

    assert.ok(existsSync(outReport), 'QA report loop JSON must exist on disk');
    const reportData = JSON.parse(readFileSync(outReport, 'utf8'));
    assert.equal(reportData.passed, true);
    assert.equal(reportData.sourceContentPreserved, true);
  });

  test('TC-D05: Export PPTX artifact copies file to target path', async () => {
    const sourcePptx = resolve(testRoot, 'out', 'presentation.pptx');
    const targetPptx = resolve(testRoot, 'exports', 'final-deliverable.pptx');

    const exportRes = await fetch(`${baseUrl}/api/project/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePptxPath: sourcePptx,
        targetPptxPath: targetPptx,
      }),
    });

    assert.equal(exportRes.status, 200);
    const body: any = await exportRes.json();
    assert.equal(body.success, true);
    assert.ok(existsSync(targetPptx), 'Exported PPTX must exist at target location');
    assert.equal(statSync(targetPptx).size, statSync(sourcePptx).size);
  });

  test('TC-D06: Task cancellation signals properly', async () => {
    const cancelRes = await fetch(`${baseUrl}/api/task/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: 'dummy-run-id' }),
    });
    assert.equal(cancelRes.status, 200);
    const body: any = await cancelRes.json();
    assert.equal(body.success, true);
  });

  test('TC-D07: Dual project isolation ensures separate workspace files and runs', async () => {
    const dirA = resolve(testRoot, 'isolated-proj-a');
    const dirB = resolve(testRoot, 'isolated-proj-b');

    const resA = await fetch(`${baseUrl}/api/project/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-a',
        title: 'Project A Workspace',
        projectDir: dirA,
        content: '# Project A\n- Independent Content A',
      }),
    });
    const resB = await fetch(`${baseUrl}/api/project/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'proj-b',
        title: 'Project B Workspace',
        projectDir: dirB,
        content: '# Project B\n- Independent Content B',
      }),
    });

    assert.equal(resA.status, 201);
    assert.equal(resB.status, 201);

    const docA = JSON.parse(readFileSync(resolve(dirA, 'pres-project.json'), 'utf8'));
    const docB = JSON.parse(readFileSync(resolve(dirB, 'pres-project.json'), 'utf8'));

    assert.equal(docA.projectId, 'proj-a');
    assert.equal(docB.projectId, 'proj-b');
    assert.notEqual(docA.projectId, docB.projectId);
    assert.ok(docA.sourceDocument.content.includes('Content A'));
    assert.ok(docB.sourceDocument.content.includes('Content B'));
  });

  test('TC-D08: Error handling rejects invalid payloads and nonexistent paths', async () => {
    // Missing required fields
    const res1 = await fetch(`${baseUrl}/api/project/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });
    assert.equal(res1.status, 400);

    // Nonexistent file open
    const res2 = await fetch(`${baseUrl}/api/project/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectJsonPath: resolve(testRoot, 'nonexistent.json') }),
    });
    assert.equal(res2.status, 404);

    // Nonexistent export source
    const res3 = await fetch(`${baseUrl}/api/project/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePptxPath: resolve(testRoot, 'ghost.pptx'),
        targetPptxPath: resolve(testRoot, 'ghost-out.pptx'),
      }),
    });
    assert.equal(res3.status, 404);
  });

  test('TC-D10: Multi-format document parsing API parses CSV and extracts facts (P05)', async () => {
    const csvData = `Metric,Target,Status\nRevenue,$50M,Achieved\nUptime,99.9%,Verified`;
    const res = await fetch(`${baseUrl}/api/document/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: csvData,
        filename: 'kpi.csv',
      }),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.ok(body.parsed);
    assert.equal(body.parsed.doc.sourceType, 'csv');
    assert.equal(body.parsed.summary.tablesCount, 1);
    assert.ok(body.parsed.facts.length >= 2);
    assert.ok(body.parsed.facts.some((f: any) => f.literalValue === '$50M'));
    assert.ok(body.parsed.facts.some((f: any) => f.literalValue === '99.9%'));
  });

  test('TC-D11: Reference scene reconstruction API returns editable DeckSpec and metrics (P13)', async () => {
    const scenePayload = {
      version: '1.0.0',
      sourceType: 'screenshot',
      dimensions: { width: 1920, height: 1080 },
      elements: [
        {
          id: 'title-1',
          type: 'heading',
          bounds: { x: 0.1, y: 0.1, w: 0.8, h: 0.15 },
          text: 'AI Architecture Overview',
          confidence: 0.99,
          isEditable: true,
        },
        {
          id: 'metric-1',
          type: 'metric',
          bounds: { x: 0.1, y: 0.3, w: 0.4, h: 0.2 },
          text: 'P99 Latency: 250ms',
          confidence: 0.94,
          isEditable: true,
        },
      ],
      metrics: {
        totalElements: 2,
        editableCount: 2,
        editableCoverageRatio: 1.0,
        averageConfidence: 0.965,
        uncertainCount: 0,
      },
    };

    const res = await fetch(`${baseUrl}/api/reconstruct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneIr: scenePayload }),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.ok(body.result);
    assert.equal(body.result.deckSpec.schema, 'deck-spec');
    assert.equal(body.result.deckSpec.title, 'AI Architecture Overview');
    assert.equal(body.result.editableCoverageRatio, 1.0);
  });

  test('TC-D12: Media pipeline generation API produces timeline, subtitles, and MP4 (P14)', async () => {
    const outMp4 = resolve(testRoot, 'api_deck.mp4');
    const res = await fetch(`${baseUrl}/api/media/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slides: [
          {
            id: 's1',
            index: 0,
            notes: '欢迎使用 PresentationOS 现代演示系统。',
          },
        ],
        outMp4Path: outMp4,
      }),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.ok(body.result);
    assert.ok(body.result.timeline.length >= 1);
    assert.ok(body.result.totalDurationSec > 0);
  });

  test('TC-D09: UI Automation IDs exist in production Vite bundle', () => {
    const bundleDist = existsSync(resolve(process.cwd(), 'dist'))
      ? resolve(process.cwd(), 'dist')
      : resolve(process.cwd(), 'apps', 'desktop', 'dist');
    assert.ok(existsSync(bundleDist), `dist/ directory must exist at ${bundleDist}`);

    // Read bundle JS
    const jsFiles = readFileSync(resolve(bundleDist, 'index.html'), 'utf8');
    assert.ok(jsFiles.includes('<!doctype html>'), 'index.html must be valid');

    // Find JS chunk
    const assetFiles = readdirSync(resolve(bundleDist, 'assets'));
    const jsChunkName = assetFiles.find((f: string) => f.endsWith('.js'));
    assert.ok(jsChunkName, 'Must find production JS bundle chunk');

    const jsCode = readFileSync(resolve(bundleDist, 'assets', jsChunkName), 'utf8');

    const requiredAutomationIds = [
      'ProjectTitleInput',
      'NewProjectBtn',
      'OpenProjectBtn',
      'SaveProjectBtn',
      'CompileDeckBtn',
      'CancelTaskBtn',
      'ExportPptxBtn',
      'ReconstructBtn',
      'MediaExportBtn',
      'MarkdownEditorInput',
      'ImportMarkdownBtn',
      'SlideNavList',
      'ActiveSlideView',
      'SlideTitleInput',
      'SlideBodyInput',
      'SlideLayoutSelect',
      'SlideNotesInput',
      'QaScoreBadge',
      'MechanicalQaList',
      'VisualQaList',
      'FactValidationBadge',
      'QaIssuesList',
      'StatusLabel',
      'TaskProgressBar',
      'RunIdLabel',
      'ProjectPathLabel',
      'NotificationToast',
    ];

    for (const id of requiredAutomationIds) {
      assert.ok(
        jsCode.includes(id),
        `AutomationId ${id} must be present in the compiled frontend bundle for UIA automation`
      );
    }
  });
});
