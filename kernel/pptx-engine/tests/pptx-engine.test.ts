import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveLayout, renderDeck } from '../src/index.js';

test('column layout produces sequential y positions', () => {
  const rects = resolveLayout({
    width: 13.33, height: 7.5, direction: 'column', gap: 'md', padding: { top: 1.5, left: 0.6, right: 0.6, bottom: 0.5 },
    children: [
      { id: 'block-0', kind: 'text', width: 1, height: 0.3 },
      { id: 'block-1', kind: 'text', width: 1, height: 0.3 },
    ],
  });
  const a = rects.get('block-0')!;
  const b = rects.get('block-1')!;
  assert.equal(a.x, 0.6);
  assert.equal(a.y, 1.5);
  assert.ok(b.y > a.y);
  assert.equal(a.w, 12.13); // 13.33 - 0.6 - 0.6
  assert.ok(Math.abs(b.y - (a.y + a.h + 0.3)) < 0.001);
});

test('rightOf places node to the right of reference', () => {
  const rects = resolveLayout({
    width: 10, height: 5, direction: 'column', gap: 'xs',
    children: [
      { id: 'a', kind: 'text', width: 0.4, height: 0.5 },
      { id: 'b', kind: 'text', width: 0.4, height: 0.5, rightOf: 'a', gap: 'sm' },
    ],
  });
  const a = rects.get('a')!;
  const b = rects.get('b')!;
  assert.equal(b.x, a.x + a.w + 0.2);
  assert.equal(b.y, a.y);
});

test('anchor top-right aligns within container', () => {
  const rects = resolveLayout({
    width: 10, height: 5, gap: 'xs',
    children: [
      { id: 't', kind: 'text', width: 0.5, height: 0.2, anchor: 'top-right' },
    ],
  });
  const t = rects.get('t')!;
  // innerW = 10 - 0.5(left) - 0.5(right) = 9；w = 0.5 * 9 = 4.5；top-right → x = 0.5 + (9-4.5) = 5
  assert.ok(Math.abs(t.x - 5) < 0.001);
});

test('renderDeck writes a real pptx file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-pptx-'));
  const out = join(dir, 'deck.pptx');
  try {
    const deck = {
      title: 'AI Presentation Engine',
      subtitle: 'Vertical Slice',
      author: 'PresentationOS',
      slides: [
        {
          id: 'slide-1', kind: 'cover', title: 'AI Presentation Engine',
          blocks: [
            { type: 'text', text: 'From Markdown to PowerPoint', style: 'h2' },
            { type: 'text', text: 'Editable, verifiable, reproducible.', style: 'body' },
          ],
        },
        {
          id: 'slide-2', kind: 'data', title: 'Quarterly Growth',
          blocks: [
            { type: 'chart', chartType: 'column', data: { labels: ['Q1', 'Q2', 'Q3'], series: [{ name: 'Revenue', values: [10, 20, 35] }] } },
            { type: 'table', headers: ['Metric', 'Q3'], rows: [['Revenue', '35'], ['Users', '120']] },
          ],
        },
        {
          id: 'slide-3', kind: 'content', title: 'Summary',
          blocks: [
            { type: 'text', text: 'Done.', style: 'h1' },
          ],
        },
      ],
    };
    const rectsBySlide = new Map<string, Map<string, { x: number; y: number; w: number; h: number }>>();
    const resolve = (slide: { id: string; blocks: unknown[] }) => {
      const key = slide.id;
      let r = rectsBySlide.get(key);
      if (!r) {
        r = resolveLayout({
          width: 13.33, height: 7.5, direction: 'column', gap: 'md', padding: { top: 1.6, left: 0.6, right: 0.6, bottom: 0.5 },
          children: slide.blocks.map((_, i) => ({ id: `block-${i}`, kind: 'text', width: 1, height: 1 / Math.max(1, slide.blocks.length) })),
        });
        rectsBySlide.set(key, r);
      }
      return r;
    };
    const res = await renderDeck(deck, { outPath: out, resolveRects: resolve as never });
    assert.ok(existsSync(out));
    const buf = readFileSync(out);
    assert.ok(buf.length > 1000);
    // PPTX 是 zip：校验 PK 头
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);
    assert.equal(res.slideCount, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
