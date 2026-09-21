// 逐页二分：将 sample.md 解析出的每页单独渲染为 PPTX
import { readFileSync } from 'node:fs';
import { resolveLayout, renderDeck } from '../../kernel/pptx-engine/dist/index.js';

const md = readFileSync('tools/vertical-slice/sample.md', 'utf8');
const lines = md.split(/\r?\n/);
let deckTitle = 'sample';
const slides = [];
let cur = null;
function pushBlock(b) { if (cur) cur.blocks.push(b); }
for (const raw of lines) {
  const line = raw.trimEnd();
  const m = /^(#{1,3})\s+(.*)$/.exec(line);
  if (m) {
    const level = m[1].length; const text = m[2].trim();
    if (level === 1) deckTitle = text;
    else if (level === 2) {
      if (cur) slides.push(cur);
      cur = { id: `slide-${slides.length + 1}`, kind: slides.length === 0 ? 'cover' : 'content', title: text, blocks: [] };
    } else pushBlock({ type: 'text', text, style: 'h3' });
    continue;
  }
  const quote = /^>\s*(.*)$/.exec(line);
  if (quote) { pushBlock({ type: 'text', text: quote[1], style: 'quote' }); continue; }
  const bullet = /^[-*]\s+(.*)$/.exec(line);
  if (bullet) { pushBlock({ type: 'text', text: bullet[1], style: 'bullet' }); continue; }
  if (/^\s*\|.*\|\s*$/.test(line)) {
    const cells = line.split('|').map((s) => s.trim()).filter((s) => s.length > 0);
    if (cells.every((c) => /^-+$/.test(c))) continue;
    if (cur && cur.pendingTable) cur.pendingTable.rows.push(cells);
    else { const t = { type: 'table', headers: cells, rows: [] }; pushBlock(t); cur.pendingTable = t; }
    continue;
  }
  if (line.trim() === '') { if (cur) cur.pendingTable = null; continue; }
  pushBlock({ type: 'text', text: line.trim(), style: 'body' });
  if (cur) cur.pendingTable = null;
}
if (cur) slides.push(cur);

function layoutFor(slide) {
  const n = Math.max(1, slide.blocks.length);
  return {
    width: 13.33, height: 7.5, direction: 'column', gap: 'md',
    padding: { top: 1.6, left: 0.6, right: 0.6, bottom: 0.5 },
    children: slide.blocks.map((_, i) => ({ id: `block-${i}`, kind: 'text', width: 1, height: Math.min(0.85, 1 / n) })),
  };
}

for (let i = 0; i < slides.length; i++) {
  const slide = slides[i];
  const deck = { title: deckTitle, author: 'PresentationOS', slides: [slide] };
  const rects = resolveLayout(layoutFor(slide));
  const out = `D:/PresentationOSData/projects/vs-demo/page-${i + 1}.pptx`;
  await renderDeck(deck, { outPath: out, resolveRects: () => rects });
  console.log(`page-${i + 1} ${slide.title} blocks=${slide.blocks.length} ${slide.blocks.map((b) => b.type).join(',')}`);
}
