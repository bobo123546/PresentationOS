import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleDensity, ruleFontSize, ruleContrast, ruleOverlap, ruleWhitespace, ruleRhythm, charCount, } from '../src/rules.js';
const slide = (index, kind, blocks, title) => ({ index, kind, blocks, title });
test('密度：超过建议上限 warn，超过硬上限 error', () => {
    const s = slide(1, 'content', [
        { id: 'b1', kind: 'body', text: 'x'.repeat(700), rect: { x: 1, y: 1, w: 5, h: 2 } },
    ]);
    assert.equal(ruleDensity(s, {}).some((i) => i.severity === 'warn'), true);
    const hard = slide(2, 'content', [
        { id: 'b1', kind: 'body', text: 'x'.repeat(1300), rect: { x: 1, y: 1, w: 5, h: 2 } },
    ]);
    assert.equal(ruleDensity(hard, {}).some((i) => i.severity === 'error'), true);
});
test('字号：正文小于最小字号 warn', () => {
    const s = slide(1, 'content', [
        { id: 'b1', kind: 'body', text: 'hi', rect: { x: 0, y: 0, w: 1, h: 1 }, style: { fontSize: 8 } },
    ]);
    const issues = ruleFontSize(s, {});
    assert.equal(issues.length, 1);
    assert.equal(issues[0].rule, 'font-size');
});
test('对比度：低对比 warn，正常无 issue', () => {
    const low = slide(1, 'content', [
        { id: 'b1', kind: 'body', text: 'x', rect: { x: 0, y: 0, w: 1, h: 1 }, style: { color: 'AAAAAA', bg: 'FFFFFF' } },
    ]);
    assert.equal(ruleContrast(low, {}).length, 1);
    const ok = slide(1, 'content', [
        { id: 'b1', kind: 'body', text: 'x', rect: { x: 0, y: 0, w: 1, h: 1 }, style: { color: '111111', bg: 'FFFFFF' } },
    ]);
    assert.equal(ruleContrast(ok, {}).length, 0);
});
test('重叠：>20% 面积判 error，无重叠无 issue', () => {
    const overlap = slide(1, 'content', [
        { id: 'a', kind: 'body', text: 'x', rect: { x: 0, y: 0, w: 2, h: 2 } },
        { id: 'b', kind: 'body', text: 'y', rect: { x: 1, y: 1, w: 2, h: 2 } },
    ]);
    assert.equal(ruleOverlap(overlap.blocks.map((b) => ({ id: b.id, rect: b.rect })), 1).length, 1);
    const clean = slide(2, 'content', [
        { id: 'a', kind: 'body', text: 'x', rect: { x: 0, y: 0, w: 1, h: 1 } },
        { id: 'b', kind: 'body', text: 'y', rect: { x: 2, y: 0, w: 1, h: 1 } },
    ]);
    assert.equal(ruleOverlap(clean.blocks.map((b) => ({ id: b.id, rect: b.rect })), 2).length, 0);
});
test('留白：内容占比>85% warn', () => {
    const s = slide(1, 'content', [
        { id: 'a', kind: 'body', text: 'x', rect: { x: 0, y: 0, w: 13, h: 7 } },
    ]);
    const issues = ruleWhitespace(s, { w: 13.333, h: 7.5 });
    assert.equal(issues.length, 1);
});
test('节奏：连续 3 页同版式 warn', () => {
    const kinds = ['content', 'content', 'content', 'summary'];
    const issues = ruleRhythm(kinds);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].rule, 'rhythm');
    assert.equal(ruleRhythm(['content', 'quote', 'content', 'summary']).length, 0);
});
test('charCount 统计', () => {
    const s = slide(1, 'content', [
        { id: 'a', kind: 'body', text: 'abc', rect: { x: 0, y: 0, w: 1, h: 1 } },
        { id: 'b', kind: 'body', text: 'defg', rect: { x: 0, y: 1, w: 1, h: 1 } },
    ]);
    assert.equal(charCount(s), 7);
});
