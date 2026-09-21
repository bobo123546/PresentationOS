// Reference Reconstruction P0（PHASE 13）：参考 PPTX → Template DNA → 驱动生成新 deck
// 用法：node tools/reference-reconstruction/reconstruct.mjs <reference.pptx> <input.md> <output.pptx> [qa.json]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { extractTemplateDna } from '../../kernel/template-dna/dist/index.js';
import { resolveLayout, renderDeck } from '../../kernel/pptx-engine/dist/index.js';
import { runMechanicalQa } from '../../kernel/mechanical-qa/dist/index.js';
import { mdToDeck, layoutFor } from '../vertical-slice/md2deck.mjs';

const refPptx = process.argv[2];
const input = process.argv[3];
const output = process.argv[4];
const qaOut = process.argv[5] ?? output.replace(/\.pptx$/i, '.qa.json');
if (!refPptx || !input || !output) {
  console.error('usage: node reconstruct.mjs <reference.pptx> <input.md> <output.pptx> [qa.json]');
  process.exit(2);
}

// 1) 提取参考模板 DNA
const dna = await extractTemplateDna(readFileSync(refPptx), refPptx);
const accent = pickAccent(dna.colors);
const font = dna.fonts[0]?.name ?? 'Segoe UI';

// 2) Markdown → DeckSpec
const md = readFileSync(input, 'utf8');
const deck = mdToDeck(md, basename(input));

// 3) Mechanical QA
mkdirSync(dirname(output), { recursive: true });
const rectsCache = new Map();
const resolveRects = (slide) => {
  const key = slide.id;
  if (!rectsCache.has(key)) rectsCache.set(key, resolveLayout(layoutFor(slide)));
  return rectsCache.get(key);
};
const qaRects = [];
for (const slide of deck.slides) {
  const rects = resolveRects(slide);
  const items = [];
  for (let i = 0; i < slide.blocks.length; i++) {
    const r = rects.get(`block-${i}`);
    if (r) items.push({ id: `block-${i}`, ...r });
  }
  const r = runMechanicalQa({ pageWidth: 13.33, pageHeight: 7.5, rects: items, blocks: slide.blocks.map((b, i) => ({ id: `block-${i}`, ...b })) });
  qaRects.push({ slide: slide.id, ok: r.ok, findings: r.findings });
}
const qaSummary = { total_slides: deck.slides.length, pass: qaRects.every((q) => q.ok), slides: qaRects };
writeFileSync(qaOut, JSON.stringify(qaSummary, null, 2), 'utf8');
if (!qaSummary.pass) { console.error('MECHANICAL_QA_FAILED'); process.exit(1); }

// 4) DNA 驱动渲染
const res = await renderDeck(deck, { outPath: output, resolveRects, dna: { accent, fontFamily: font } });
console.log(JSON.stringify({
  reference: refPptx,
  dna: { accent, font, topColors: dna.colors.slice(0, 6), slideCount: dna.slideCount },
  deck: deck.title,
  slides: res.slideCount,
  pptx: output,
  mechanicalQA: qaOut,
}, null, 2));

/** 从 DNA 颜色中选主 accent：跳过灰/黑/白中性色，取最高频彩色 */
function pickAccent(colors) {
  const neutral = new Set(['FFFFFF', 'F9FAFB', 'F3F4F6', 'F8FAFC', 'E5E7EB', 'D1D5DB', '9CA3AF', '6B7280', '111827', '1F2937', '374151', '4B5563']);
  for (const c of colors) {
    if (!neutral.has(c.hex)) return c.hex;
  }
  return colors[0]?.hex ?? '2563EB';
}
