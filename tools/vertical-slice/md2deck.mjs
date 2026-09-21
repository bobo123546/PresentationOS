// 共享：Markdown → DeckSpec（Vertical Slice / Reference Reconstruction 共用）
export function mdToDeck(md, name) {
  const lines = md.split(/\r?\n/);
  let deckTitle = name.replace(/\.md$/i, '');
  const slides = [];
  let cur = null;
  const pushBlock = (block) => { if (cur) cur.blocks.push(block); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      if (level === 1) {
        deckTitle = text;
      } else if (level === 2) {
        if (cur) slides.push(cur);
        cur = { id: `slide-${slides.length + 1}`, kind: slides.length === 0 ? 'cover' : 'content', title: text, blocks: [] };
      } else {
        pushBlock({ type: 'text', text, style: 'h3' });
      }
      continue;
    }
    const quote = /^>\s*(.*)$/.exec(line);
    if (quote) { pushBlock({ type: 'text', text: quote[1], style: 'quote' }); continue; }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) { pushBlock({ type: 'text', text: bullet[1], style: 'bullet' }); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.split('|').map((s) => s.trim()).filter((s) => s.length > 0);
      if (cells.every((c) => /^-+$/.test(c))) continue;
      if (cur && cur.pendingTable) { cur.pendingTable.rows.push(cells); }
      else { const tbl = { type: 'table', headers: cells, rows: [] }; pushBlock(tbl); cur.pendingTable = tbl; }
      continue;
    }
    if (line.trim() === '') { if (cur) cur.pendingTable = null; continue; }
    pushBlock({ type: 'text', text: line.trim(), style: 'body' });
    if (cur) cur.pendingTable = null;
  }
  if (cur) slides.push(cur);
  if (slides.length === 0) {
    slides.push({ id: 'slide-1', kind: 'cover', title: deckTitle, blocks: [{ type: 'text', text: '(empty markdown)', style: 'body' }] });
  }
  return { title: deckTitle, author: 'PresentationOS', slides };
}

// 每页布局：title 占顶，blocks 流式
export function layoutFor(slide) {
  const n = Math.max(1, slide.blocks.length);
  const children = slide.blocks.map((_, i) => ({
    id: `block-${i}`,
    kind: 'text',
    width: 1,
    height: Math.min(0.85, 1 / n),
  }));
  return {
    width: 13.33, height: 7.5, direction: 'column', gap: 'md',
    padding: { top: 1.6, left: 0.6, right: 0.6, bottom: 0.5 },
    children,
  };
}
