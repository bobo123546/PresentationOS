import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRevisions, truncate, contrast } from '../src/apply.js';
const deck = () => ({
    title: 't',
    slides: [
        { id: 's1', kind: 'content', title: '一', blocks: [
                { type: 'text', text: 'x'.repeat(400), style: 'body' },
                { type: 'text', text: 'b', style: 'body' },
                { type: 'text', text: 'c', style: 'body' },
            ] },
        { id: 's2', kind: 'content', title: '二', blocks: [{ type: 'text', text: 'd', style: 'body' }] },
    ],
});
test('split：三块拆成 2+1，新页插在原页后', () => {
    const d = deck();
    const r = applyRevisions(d, [{ slide: 1, action: 'split', reason: '密度' }]);
    assert.equal(r.deck.slides.length, 3);
    assert.equal(r.deck.slides[0].blocks.length, 2);
    assert.equal(r.deck.slides[1].blocks.length, 1);
    assert.equal(r.deck.slides[1].title, '一（续）');
    assert.equal(r.changes.length, 1);
});
test('reduce_text：超长块截断到 300 + …', () => {
    const d = deck();
    const r = applyRevisions(d, [{ slide: 1, action: 'reduce_text', reason: 'r' }]);
    const b0 = r.deck.slides[0].blocks[0];
    assert.ok(b0.text.length <= 301);
    assert.ok(b0.text.endsWith('…'));
    // 短块不受影响
    assert.equal(r.deck.slides[0].blocks[1].text, 'b');
});
test('increase_font：正文块 fontScale=1.25', () => {
    const d = deck();
    const r = applyRevisions(d, [{ slide: 1, action: 'increase_font', reason: 'r' }]);
    for (const b of r.deck.slides[0].blocks)
        assert.equal(b.fontScale, 1.25);
});
test('fix_contrast：低对比色替换为高对比', () => {
    const d = {
        title: 't',
        slides: [{ id: 's1', kind: 'content', title: 'x', blocks: [
                    { type: 'text', text: 'a', style: 'body', color: 'AAAAAA' },
                    { type: 'text', text: 'b', style: 'body', color: '111111' },
                ] }],
    };
    const r = applyRevisions(d, [{ slide: 1, action: 'fix_contrast', reason: 'r' }]);
    const blocks = r.deck.slides[0].blocks;
    assert.equal(blocks[0].color, '111111'); // 灰 AAAAAA -> 深色
    assert.equal(blocks[1].color, '111111'); // 已达标不动
});
test('add_visual：连续 content 打断为 section', () => {
    const d = deck(); // s1 content, s2 content
    const r = applyRevisions(d, [{ slide: 2, action: 'add_visual', reason: 'rhythm' }]);
    assert.equal(r.deck.slides[1].kind, 'section');
});
test('increase_margin 映射为精简文本', () => {
    const d = deck();
    const r = applyRevisions(d, [{ slide: 1, action: 'increase_margin', reason: 'm' }]);
    assert.equal(r.changes[0].action, 'increase_margin');
    assert.ok(r.deck.slides[0].blocks[0].text.length <= 301);
});
test('同页同 action 去重', () => {
    const d = deck();
    const r = applyRevisions(d, [
        { slide: 1, action: 'split', reason: 'a' },
        { slide: 1, action: 'split', reason: 'b' },
    ]);
    assert.equal(r.changes.length, 1);
});
test('页码越界跳过不崩溃', () => {
    const d = deck();
    const r = applyRevisions(d, [{ slide: 99, action: 'split', reason: 'x' }]);
    assert.equal(r.changes[0].detail.includes('越界'), true);
    assert.equal(r.deck.slides.length, 2);
});
test('truncate 边界', () => {
    assert.equal(truncate('abc', 5), 'abc');
    assert.equal(truncate('abcdef', 3), 'abc…');
});
test('contrast 计算', () => {
    assert.ok(contrast('111111', 'FFFFFF') > 10);
    assert.ok(contrast('AAAAAA', 'FFFFFF') < 4);
});
