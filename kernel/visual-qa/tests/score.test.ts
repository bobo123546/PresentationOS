import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVisualQa, scoreSlide } from '../src/score.js';
import type { QaIssue, QaSlide } from '../src/types.js';

const goodDeck = (): QaSlide[] => [
  { index: 1, kind: 'cover', title: '标题', blocks: [
    { id: 't', kind: 'title', text: '标题', rect: { x: 1, y: 2, w: 8, h: 1 }, style: { fontSize: 32, color: 'FFFFFF', bg: '1F2937' } },
  ] },
  { index: 2, kind: 'content', title: '内容页', blocks: [
    { id: 't', kind: 'title', text: '内容页', rect: { x: 0.6, y: 0.35, w: 8, h: 0.8 }, style: { fontSize: 28, color: '111827', bg: 'FFFFFF' } },
    { id: 'b', kind: 'body', text: '要点一', rect: { x: 1, y: 2, w: 8, h: 0.6 }, style: { fontSize: 18, color: '111827', bg: 'FFFFFF' } },
    { id: 'c', kind: 'body', text: '要点二', rect: { x: 1, y: 3, w: 8, h: 0.6 }, style: { fontSize: 18, color: '111827', bg: 'FFFFFF' } },
  ] },
  { index: 3, kind: 'summary', title: '总结', blocks: [
    { id: 't', kind: 'title', text: '总结', rect: { x: 0.6, y: 0.35, w: 8, h: 0.8 }, style: { fontSize: 28, color: '111827', bg: 'F8FAFC' } },
  ] },
];

const badDeck = (): QaSlide[] => [
  { index: 1, kind: 'content', title: '塞满', blocks: [
    { id: 'a', kind: 'title', text: '塞满', rect: { x: 0, y: 0, w: 13, h: 7 }, style: { fontSize: 6, color: 'AAAAAA', bg: 'FFFFFF' } },
    { id: 'b', kind: 'body', text: 'x'.repeat(1400), rect: { x: 0, y: 0, w: 13, h: 7 }, style: { fontSize: 8, color: 'BBBBBB', bg: 'FFFFFF' } },
  ] },
  { index: 2, kind: 'content', title: '塞满2', blocks: [
    { id: 'a', kind: 'body', text: 'y'.repeat(1400), rect: { x: 0, y: 0, w: 13, h: 7 }, style: { fontSize: 8, color: 'BBBBBB', bg: 'FFFFFF' } },
  ] },
  { index: 3, kind: 'content', title: '塞满3', blocks: [
    { id: 'a', kind: 'body', text: 'z'.repeat(1400), rect: { x: 0, y: 0, w: 13, h: 7 }, style: { fontSize: 8, color: 'BBBBBB', bg: 'FFFFFF' } },
  ] },
];

test('好 deck 评分高、问题少', () => {
  const r = runVisualQa(goodDeck());
  assert.ok(r.overall >= 85, `overall=${r.overall}`);
  assert.equal(r.revision.length, 0);
});

test('坏 deck 评分低、产生 split 修订建议', () => {
  const r = runVisualQa(badDeck());
  assert.ok(r.overall < 60, `overall=${r.overall}`);
  assert.ok(r.revision.some((s) => s.action === 'split'), JSON.stringify(r.revision));
  assert.ok(r.revision.some((s) => s.action === 'increase_font'));
  assert.ok(r.revision.some((s) => s.action === 'fix_contrast'));
});

test('scoreSlide 返回每页分数与问题', () => {
  const issues: QaIssue[] = [{ slide: 1, rule: 'density', severity: 'error', message: 'm' }];
  const s = scoreSlide({ index: 1, kind: 'content', blocks: [{ id: 'a', kind: 'body', text: 'x'.repeat(1300), rect: { x: 0, y: 0, w: 1, h: 1 } }] }, issues);
  assert.ok(s.score < 80);
  assert.equal(s.issues.length, 1);
});

test('空 deck 报告不崩溃', () => {
  const r = runVisualQa([]);
  assert.equal(r.overall, 100);
  assert.equal(r.slides.length, 0);
});
