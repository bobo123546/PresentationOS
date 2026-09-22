// Revision Loop 集成：md → deck → Visual QA → 规则修订（最多 3 轮）→ 渲染 PPTX → Mechanical QA
// 用法: node tools/revision-loop/loop-deck.mjs <in.md> <out.pptx> [loop-report.json]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mdToDeck, layoutFor } from '../vertical-slice/md2deck.mjs';
import { runVisualQa } from '../../kernel/visual-qa/dist/index.js';
import { applyRevisions } from '../../kernel/revision-engine/dist/index.js';
import { resolveLayout, renderDeck } from '../../kernel/pptx-engine/dist/index.js';
import { runMechanicalQa } from '../../kernel/mechanical-qa/dist/index.js';

const input = process.argv[2];
const output = process.argv[3];
const reportOut = process.argv[4] ?? output.replace(/\.pptx$/i, '.loop.json');
if (!input || !output) { console.error('usage: node loop-deck.mjs <in.md> <out.pptx> [report.json]'); process.exit(2); }

const KIND_THEME = {
  cover: { fg: 'FFFFFF', bg: '1F2937' }, toc: { fg: '111827', bg: 'FFFFFF' }, section: { fg: 'FFFFFF', bg: '111827' },
  content: { fg: '111827', bg: 'FFFFFF' }, data: { fg: '111827', bg: 'FFFFFF' }, quote: { fg: '111827', bg: 'F3F4F6' },
  summary: { fg: '111827', bg: 'F8FAFC' }, ending: { fg: 'FFFFFF', bg: '1F2937' },
};
const STYLE_FONT = { h3: 18, quote: 14, bullet: 16, body: 14, title: 28 };

function deckToQaSlides(deck) {
  return deck.slides.map((slide, idx) => {
    const theme = KIND_THEME[slide.kind] ?? KIND_THEME.content;
    const layout = layoutFor(slide);
    const blocks = [
      { id: 'title', kind: 'title', text: slide.title ?? '', rect: { x: 0.6, y: 0.35, w: 12.1, h: 0.8 }, style: { fontSize: 28, color: theme.fg, bg: theme.bg } },
      ...slide.blocks.map((b, i) => {
        const n = Math.max(1, slide.blocks.length);
        const h = Math.max(0.35, (layout.height - 1.6 - 0.5) / n);
        return {
          id: `block-${i}`, kind: b.type === 'table' ? 'table' : b.style === 'quote' ? 'quote' : 'body',
          text: b.type === 'table' ? `表: ${(b.headers ?? []).join(' | ')}` : b.text ?? '',
          rect: { x: 0.6, y: 1.6 + i * h, w: 12.1, h },
          style: { fontSize: STYLE_FONT[b.style] ?? 14, color: b.color ?? theme.fg, bg: theme.bg },
        };
      }),
    ];
    return { index: idx + 1, kind: slide.kind, title: slide.title, blocks };
  });
}

const md = readFileSync(input, 'utf8');
let deck = mdToDeck(md, 'loop-deck');
const history = [];
let report = runVisualQa(deckToQaSlides(deck));
history.push({ round: 0, overall: report.overall, issues: report.issues.length, revisions: report.revision.length });

for (let round = 1; round <= 3 && report.revision.length > 0; round++) {
  const res = applyRevisions(deck, report.revision);
  deck = res.deck;
  report = runVisualQa(deckToQaSlides(deck));
  history.push({ round, overall: report.overall, issues: report.issues.length, revisions: report.revision.length, changes: res.changes });
}

// 渲染最终 deck
mkdirSync(dirname(output), { recursive: true });
const rectsCache = new Map();
const resolveRects = (slide) => {
  const key = slide.id;
  if (!rectsCache.has(key)) rectsCache.set(key, resolveLayout(layoutFor(slide)));
  return rectsCache.get(key);
};
const rendered = await renderDeck(deck, { outPath: output, resolveRects });

// Mechanical QA on final deck
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

const summary = {
  deck: deck.title,
  rounds: history,
  final: { overall: report.overall, slides: deck.slides.length, issues: report.issues },
  mechanical: { pass: qaRects.every((q) => q.ok), slides: qaRects },
  pptx: output,
  slideCount: rendered.slideCount,
};
writeFileSync(reportOut, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify({ deck: deck.title, finalOverall: report.overall, slides: deck.slides.length, mechanicalPass: summary.mechanical.pass, pptx: output, report: reportOut }, null, 2));
