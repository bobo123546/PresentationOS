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

test('unknown schema id fails loudly', () => {
  const r = validate('https://presentationos.local/schemas/nope/1', {});
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /not loaded/);
});
