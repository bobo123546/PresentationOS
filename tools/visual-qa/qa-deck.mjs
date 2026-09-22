// 集成：真实 Markdown → DeckSpec → QaSlide → Visual QA 报告（确定性规则版）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdToDeck, layoutFor } from '../vertical-slice/md2deck.mjs';
import { runVisualQa } from '../../kernel/visual-qa/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');

const [mdPath, outJson] = process.argv.slice(2);
if (!mdPath || !outJson) {
  console.error('用法: node qa-deck.mjs <deck.md> <out.json>');
  process.exit(2);
}

const md = readFileSync(mdPath, 'utf8');
const deck = mdToDeck(md, 'deck');

// 与 pptx-engine renderer 一致的页面主题色
const KIND_THEME = {
  cover: { fg: 'FFFFFF', bg: '1F2937' },
  toc: { fg: '111827', bg: 'FFFFFF' },
  section: { fg: 'FFFFFF', bg: '111827' },
  content: { fg: '111827', bg: 'FFFFFF' },
  data: { fg: '111827', bg: 'FFFFFF' },
  quote: { fg: '111827', bg: 'F3F4F6' },
  summary: { fg: '111827', bg: 'F8FAFC' },
  ending: { fg: 'FFFFFF', bg: '1F2937' },
};

const STYLE_FONT = { h3: 18, quote: 14, bullet: 16, body: 14, title: 28 };

const qaSlides = deck.slides.map((slide, idx) => {
  const theme = KIND_THEME[slide.kind] ?? KIND_THEME.content;
  const layout = layoutFor(slide);
  const canvasH = layout.height;
  const blocks = [
    {
      id: 'title',
      kind: 'title',
      text: slide.title ?? '',
      rect: { x: 0.6, y: 0.35, w: 12.1, h: 0.8 },
      style: { fontSize: 28, color: theme.fg, bg: theme.bg },
    },
    ...slide.blocks.map((b, i) => {
      const n = Math.max(1, slide.blocks.length);
      const h = Math.max(0.35, (canvasH - 1.6 - 0.5) / n);
      return {
        id: `block-${i}`,
        kind: b.type === 'table' ? 'table' : b.style === 'quote' ? 'quote' : 'body',
        text: b.type === 'table' ? `表: ${b.headers.join(' | ')}` : b.text,
        rect: { x: 0.6, y: 1.6 + i * h, w: 12.1, h },
        style: { fontSize: STYLE_FONT[b.style] ?? 14, color: theme.fg, bg: theme.bg },
      };
    }),
  ];
  return { index: idx + 1, kind: slide.kind, title: slide.title, blocks };
});

const report = runVisualQa(qaSlides);
mkdirSync(dirname(outJson), { recursive: true });
writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  deck: deck.title,
  slides: qaSlides.length,
  overall: report.overall,
  issues: report.issues.length,
  revisions: report.revision.length,
  report: outJson,
}, null, 2));
