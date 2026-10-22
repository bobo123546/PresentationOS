import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runMechanicalQa } from '../src/index.js';

test('clean layout passes', () => {
  const r = runMechanicalQa({
    pageWidth: 13.33, pageHeight: 7.5,
    rects: [
      { id: 'a', x: 0.6, y: 1.6, w: 6, h: 1 },
      { id: 'b', x: 0.6, y: 3.0, w: 6, h: 1 },
    ],
    blocks: [{ id: 't1', type: 'text', text: 'hello' }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.findings.length, 0);
});

test('negative size is an error (BUG-0002 regression)', () => {
  const r = runMechanicalQa({
    pageWidth: 13.33, pageHeight: 7.5,
    rects: [{ id: 'bad', x: 0.6, y: 7.12, w: 12, h: -0.12 }],
    blocks: [],
  });
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.check === 'non-positive-size' && f.severity === 'error'));
});

test('overflow is a warning', () => {
  const r = runMechanicalQa({
    pageWidth: 13.33, pageHeight: 7.5,
    rects: [{ id: 'o', x: 0.6, y: 7.0, w: 12, h: 1.0 }],
    blocks: [],
  });
  assert.ok(r.findings.some((f) => f.check === 'overflow'));
  assert.equal(r.ok, true); // 仅 warning 不阻塞
});

test('overlap detected between two rects', () => {
  const r = runMechanicalQa({
    pageWidth: 13.33, pageHeight: 7.5,
    rects: [
      { id: 'a', x: 1, y: 1, w: 4, h: 1 },
      { id: 'b', x: 2, y: 1, w: 4, h: 1 },
    ],
    blocks: [],
  });
  assert.ok(r.findings.some((f) => f.check === 'overlap'));
});

test('XML control characters are rejected while literal punctuation is allowed', () => {
  const r = runMechanicalQa({
    pageWidth: 10, pageHeight: 5,
    rects: [{ id: 't', x: 0, y: 0, w: 5, h: 1 }],
    blocks: [{ id: 't', type: 'text', text: 'a\u0001b' }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.check === 'invalid-xml-character'));
  assert.equal(runMechanicalQa({pageWidth:10,pageHeight:5,rects:[],blocks:[{type:'text',text:'a < b & c > d'}]}).ok,true);
});

test('chart length mismatch is an error', () => {
  const r = runMechanicalQa({
    pageWidth: 10, pageHeight: 5,
    rects: [{ id: 'c', x: 0, y: 0, w: 5, h: 2 }],
    blocks: [{ id: 'c', type: 'chart', chartType: 'bar', data: { labels: ['A', 'B'], series: [{ name: 'S', values: [1] }] } }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.check === 'chart-length-mismatch'));
});

test('empty text is an error', () => {
  const r = runMechanicalQa({
    pageWidth: 10, pageHeight: 5,
    rects: [{ id: 't', x: 0, y: 0, w: 5, h: 1 }],
    blocks: [{ id: 't', type: 'text', text: '   ' }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.check === 'empty-text'));
});
