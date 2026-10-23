// PresentationOS Deck Pipeline & QA Inspection Core
import { resolveLayout, resolveSlideScene, type DeckSpec, type DeckSlide, type LayoutIR } from '@pres/pptx-engine';
import { runMechanicalQa } from '@pres/mechanical-qa';
import { runVisualQa, type QaReport } from '@pres/visual-qa';
import { loadAllSchemas, validate, SCHEMA_IDS } from '@pres/schema-validator';

let schemasLoaded: Promise<number> | null = null;

export async function ensureSchemas(): Promise<void> {
  schemasLoaded ??= loadAllSchemas();
  await schemasLoaded;
}

export function layoutFor(slide: DeckSlide): LayoutIR {
  const n = Math.max(1, slide.blocks.length);
  const children = slide.blocks.map((_, i) => ({
    id: `block-${i}`,
    kind: 'text' as const,
    width: 1,
    height: Math.min(0.85, 1 / n),
  }));
  return {
    schema: 'layout-ir',
    version: '1',
    width: 13.33,
    height: 7.5,
    direction: 'column',
    gap: 'md',
    padding: { top: 1.6, left: 0.6, right: 0.6, bottom: 0.5 },
    children,
  };
}

export function mdToDeck(md: string, name = 'deck'): DeckSpec {
  let title = name.replace(/\.md$/i, '');
  const sections: Array<{ title: string; blocks: any[] }> = [];
  let current: { title: string; blocks: any[] } | undefined;
  let table: { type: 'table'; headers: string[]; rows: string[][] } | undefined;
  let awaitingTableSeparator = false;
  let hasDocumentTitle = false;

  const ensure = () => current ??= { title, blocks: [] };
  const flush = () => { if (current) sections.push(current); current = undefined; table = undefined; };

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      table = undefined;
      if (heading[1].length === 1) {
        if (!hasDocumentTitle) { title = heading[2].trim(); hasDocumentTitle = true; }
        flush();
        current = { title: heading[2].trim(), blocks: [] };
        continue;
      }
      if (heading[1].length === 2) {
        flush();
        current = { title: heading[2].trim(), blocks: [] };
      } else {
        ensure().blocks.push({ type: 'text', text: heading[2].trim(), style: 'h3' });
      }
      continue;
    }
    if (!line.trim()) { table = undefined; continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().slice(1, -1).split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
      if (table && awaitingTableSeparator) {
        awaitingTableSeparator = false;
        if (cells.length === table.headers.length && cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      }
      if (table) {
        table.rows.push(cells);
      } else {
        table = { type: 'table', headers: cells, rows: [] };
        awaitingTableSeparator = true;
        ensure().blocks.push(table);
      }
      continue;
    }
    table = undefined;
    const special = /^(>|[-*])\s+(.*)$/.exec(line);
    ensure().blocks.push({
      type: 'text',
      text: special ? special[2] : line.trim(),
      style: special ? (special[1] === '>' ? 'quote' : 'bullet') : 'body',
    });
  }
  flush();

  if (!sections.length) throw new Error('Markdown contains no presentation content');

  const slides: DeckSlide[] = [];
  for (const section of sections) {
    const blocks = section.blocks.flatMap((block) => {
      if (block.type === 'text') {
        const chars = Array.from(block.text as string);
        const parts: any[] = [];
        for (let i = 0; i < chars.length; i += 700) {
          parts.push({ ...block, text: chars.slice(i, i + 700).join('') });
        }
        return parts.length ? parts : [block];
      }
      if (!block.rows.length) return [block];
      const parts: any[] = [];
      for (let i = 0; i < block.rows.length; i += 8) {
        parts.push({ ...block, rows: block.rows.slice(i, i + 8) });
      }
      return parts;
    });

    const pages: any[][] = [];
    let page: any[] = [], cost = 0;
    for (const block of blocks) {
      const next = block.type === 'table' ? 4 : Math.max(1, Math.ceil(block.text.length / 220));
      if (page.length && cost + next > 4) { pages.push(page); page = []; cost = 0; }
      page.push(block); cost += next;
    }
    if (page.length || !pages.length) pages.push(page);

    pages.forEach((p, index) => {
      const slide: DeckSlide = {
        id: `slide-${slides.length + 1}`,
        kind: slides.length === 0 ? 'cover' : 'content',
        title: section.title + (index ? ' (continued)' : ''),
        blocks: p,
      };
      slide.layout = layoutFor(slide);
      slides.push(slide);
    });
  }

  return { schema: 'deck-spec', version: '1', title, author: 'PresentationOS', slides };
}

export async function validateDeck(deck: DeckSpec): Promise<DeckSpec> {
  await ensureSchemas();
  const result = validate(SCHEMA_IDS.deckSpec, deck);
  if (!result.valid) throw new Error(`DeckSpec schema failed: ${result.errors.join('; ')}`);
  if (new Set(deck.slides.map((s) => s.id)).size !== deck.slides.length) {
    throw new Error('Duplicate slide ID in deck');
  }
  return deck;
}

export function contentSnapshot(deck: DeckSpec): string {
  return JSON.stringify(
    deck.slides.flatMap((s) => s.blocks).map(({ fontScale, color, ...block }: any) => block)
  );
}

export interface DeckInspectionResult {
  passed: boolean;
  mechanical: { pass: boolean; slides: any[] };
  visual: QaReport;
  native: { status: 'NOT_ATTEMPTED' | 'PASS' | 'FAILED' };
}

export function inspectDeck(deck: DeckSpec): DeckInspectionResult {
  const mechanical: any[] = [];
  const slides = deck.slides.map((slide, index) => {
    const scene = resolveSlideScene(slide, () => resolveLayout(slide.layout ?? layoutFor(slide)));
    const rects = [{ id: 'title', ...scene.title.rect }, ...scene.blocks.map(({ id, rect }) => ({ id, ...rect }))];
    const check = runMechanicalQa({
      pageWidth: 13.33,
      pageHeight: 7.5,
      rects,
      blocks: [{ id: 'title', type: 'text', text: slide.title }, ...scene.blocks.map(({ id, block }) => ({ id, ...block }))],
    });
    mechanical.push({ slide: slide.id, ...check });
    return {
      index: index + 1,
      kind: slide.kind,
      title: slide.title,
      blocks: [
        { id: 'title', kind: 'title', text: slide.title, rect: scene.title.rect, style: { fontSize: scene.title.fontSize, color: scene.theme.font, bg: scene.theme.fill } },
        ...scene.blocks.map(({ id, block, rect, fontSize }: any) => ({
          id,
          kind: block.type === 'text' ? 'body' : block.type,
          text: block.type === 'table' ? [block.headers, ...block.rows].flat().join(' ') : block.text,
          rect,
          style: {
            fontSize,
            color: block.type === 'table' ? '111827' : block.color ?? scene.theme.font,
            bg: block.type === 'table' ? 'F9FAFB' : scene.theme.fill,
          },
        })),
      ],
    };
  });

  const visual = runVisualQa(slides);
  const mechanicalPass = mechanical.every((check) => check.ok && !check.findings.some((finding: any) => ['overflow', 'overlap'].includes(finding.check)));
  return {
    passed: mechanicalPass && !visual.issues.some((issue) => issue.severity === 'error'),
    mechanical: { pass: mechanicalPass, slides: mechanical },
    visual,
    native: { status: 'NOT_ATTEMPTED' },
  };
}
