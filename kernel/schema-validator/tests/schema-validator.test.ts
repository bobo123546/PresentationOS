// Schema 验证器测试：valid 通过 / invalid 失败 / 跨引用 deck-spec↔layout↔design-token
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadAllSchemas, validate, SCHEMA_IDS } from '../src/index.js';

before(async () => {
  const n = await loadAllSchemas();
  assert.ok(n >= 6, `expected >=6 schemas loaded, got ${n}`);
});

test('document-ir valid case passes', () => {
  const doc = {
    schema: 'document-ir', version: '1', source: 'test.md', sourceType: 'markdown',
    blocks: [
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'paragraph', text: 'Body' },
      { type: 'list', ordered: false, items: ['a', 'b'] },
      { type: 'table', headers: ['h1'], rows: [['v1']] },
    ],
  };
  const r = validate(SCHEMA_IDS.documentIr, doc);
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('document-ir invalid block type fails', () => {
  const doc = {
    schema: 'document-ir', version: '1', source: 'test.md', sourceType: 'markdown',
    blocks: [{ type: 'heading', text: 'no level' }],
  };
  const r = validate(SCHEMA_IDS.documentIr, doc);
  assert.equal(r.valid, false);
  assert.ok(r.errors.length > 0);
});

test('narrative-ir valid case passes', () => {
  const n = {
    schema: 'narrative-ir', version: '1', topic: 'AI PPT', audience: 'execs', coreMessage: 'build',
    storyArc: [{ id: 'sec-1', title: 'Intro', intent: 'hook', points: ['p1'] }],
  };
  const r = validate(SCHEMA_IDS.narrativeIr, n);
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('deck-spec with layout and design-token cross refs passes', () => {
  const deck = {
    schema: 'deck-spec', version: '1', title: 'Demo',
    designTokens: {
      schema: 'design-token', version: '1',
      colors: { primary: '#1a1a2e', secondary: '#16213e', background: '#ffffff', text: '#000000' },
      fonts: { heading: 'Arial', body: 'Arial' },
    },
    slides: [
      {
        id: 'slide-1', kind: 'cover', title: 'Demo Deck',
        layout: {
          schema: 'layout-ir', version: '1', width: 13.333, height: 7.5,
          children: [{ id: 'title', kind: 'title', width: 1, anchor: 'top-left' }],
        },
        blocks: [{ type: 'text', text: 'Hello' }],
      },
    ],
  };
  const r = validate(SCHEMA_IDS.deckSpec, deck);
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('deck-spec invalid slide kind fails', () => {
  const deck = {
    schema: 'deck-spec', version: '1', title: 'Bad',
    slides: [{ id: 'slide-1', kind: 'mystery', title: 'X', layout: { schema: 'layout-ir', version: '1', width: 10, height: 5 }, blocks: [] }],
  };
  const r = validate(SCHEMA_IDS.deckSpec, deck);
  assert.equal(r.valid, false);
});

test('qa-report valid case passes', () => {
  const q = {
    schema: 'qa-report', version: '1', qaType: 'mechanical', result: 'fail',
    checks: [{ id: 'c1', name: 'overflow', status: 'fail', severity: 'critical', target: 'slide-1' }],
  };
  const r = validate(SCHEMA_IDS.qaReport, q);
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('project-spec valid case passes and invalid rejected', () => {
  const validProject = {
    schema: 'presentationos-project',
    version: '1.0.0',
    projectId: 'demo-proj-001',
    title: 'Demo Presentation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceDocument: {
      filename: 'sample.md',
      format: 'markdown',
      content: '# Title\n\nContent',
    },
    lastCompileState: {
      status: 'IDLE',
    },
  };
  const r1 = validate(SCHEMA_IDS.project, validProject);
  assert.ok(r1.valid, JSON.stringify(r1.errors));

  // Test that PAUSED and CANCELLING statuses roundtrip cleanly under project schema
  for (const status of ['PAUSED', 'CANCELLING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const) {
    const statusProject = { ...validProject, lastCompileState: { status } };
    const rStatus = validate(SCHEMA_IDS.project, statusProject);
    assert.ok(rStatus.valid, `Expected status ${status} to be valid under project schema, got: ${JSON.stringify(rStatus.errors)}`);
  }

  const invalidProject = {
    schema: 'presentationos-project',
    version: '1.0.0',
    // 缺少 projectId 和 sourceDocument
    title: 'Incomplete',
  };
  const r2 = validate(SCHEMA_IDS.project, invalidProject);
  assert.equal(r2.valid, false);
});

test('render-ir valid case passes and invalid rejected', () => {
  const validRender = {
    schema: 'render-ir',
    version: '1',
    slideWidth: 13.333,
    slideHeight: 7.5,
    slides: [
      {
        slideIndex: 0,
        backgroundColor: '#0b0f19',
        elements: [
          {
            id: 'elem-1',
            type: 'text',
            x: 0.8,
            y: 1.0,
            w: 11.7,
            h: 1.2,
            text: 'Slide Title',
            fontSize: 28,
            fontColor: '#ffffff',
          },
        ],
      },
    ],
  };
  const r1 = validate(SCHEMA_IDS.renderIr, validRender);
  assert.ok(r1.valid, JSON.stringify(r1.errors));

  const invalidRender = {
    schema: 'render-ir',
    version: '1',
    // 缺少 slideWidth/slideHeight
    slides: [],
  };
  const r2 = validate(SCHEMA_IDS.renderIr, invalidRender);
  assert.equal(r2.valid, false);
});

test('evidence-ir valid case passes', () => {
  const validEvidence = {
    timestamp: new Date().toISOString(),
    evidenceType: 'unit-test',
    taskId: 'TASK-0003',
    status: 'VERIFIED',
    pass: true,
    exitCode: 0,
    details: { totalPassed: 10 },
  };
  const r = validate(SCHEMA_IDS.evidenceIr, validEvidence);
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('revision-record valid case passes', () => {
  const validRevision = {
    schema: 'revision-record',
    version: '1',
    revisionId: 'rev-001',
    round: 1,
    beforeScore: 82,
    afterScore: 96,
    appliedActions: [
      { slideIndex: 0, action: 'split', ruleId: 'RULE-OVERFLOW', description: 'Split overloaded slide' },
    ],
    factsPreserved: true,
  };
  const r = validate(SCHEMA_IDS.revision, validRevision);
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('unknown schema id fails loudly', () => {
  const r = validate('https://presentationos.local/schemas/nope/1', {});
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /not loaded/);
});
