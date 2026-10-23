// PresentationOS Deck Pipeline & QA Inspection Core
import { resolveLayout, resolveDeckScenes, type DeckSpec, type DeckSlide, type LayoutIR } from '@pres/pptx-engine';
import { runMechanicalQa } from '@pres/mechanical-qa';
import { runVisualQa, type QaReport } from '@pres/visual-qa';
import { loadAllSchemas, validate, SCHEMA_IDS } from '@pres/schema-validator';
import { contrast } from '@pres/revision-engine';
import { extractFacts } from '@pres/document-parser';

let schemasLoaded: Promise<number> | null = null;

export async function ensureSchemas(): Promise<void> {
  schemasLoaded ??= loadAllSchemas();
  await schemasLoaded;
}

export function layoutFor(slide: DeckSlide): LayoutIR {
  const n = Math.max(1, slide.blocks.length);
  const available = 5.4;
  const fraction = Math.max(0.05, (available - (n - 1) * 0.3) / n / available);
  const children = slide.blocks.map((_, i) => ({
    id: `block-${i}`,
    kind: 'text' as const,
    width: 1,
    height: fraction,
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

  return sectionsToDeck(title, sections);
}

/** Shared lossless pagination for Markdown and parsed document blocks. */
export function sectionsToDeck(title: string, sections: Array<{ title: string; blocks: any[] }>): DeckSpec {
  if (!sections.length) throw new Error('Document contains no presentation content');

  const slides: DeckSlide[] = [];
  for (const section of sections) {
    const blocks = section.blocks.flatMap((block) => {
      if (block.type === 'text') {
        return splitTextForSlides(block.text).map(text => ({ ...block, text }));
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

/** Split without cutting graphemes, literal quantities, words or URLs in half. */
export function splitTextForSlides(text: string, capacity = 700): string[] {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Slide text capacity must be a positive integer');
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
  const protectedRanges = [
    ...extractFacts(text).map(fact => fact.charRange!).filter(Boolean),
    ...[...text.matchAll(/\d{4}[-/]\d{1,2}[-/]\d{1,2}|[+\-−]?(?:[$¥￥€£]\s*)?\d[\d,，.]*(?:[eE][+\-]?\d+)?(?:\s*(?:万元|亿元|人民币|美元|%|％|万|亿|元|家|人|台|年|月|日|ms|GB|TB))?/g)].map(match => [match.index!, match.index! + match[0].length] as [number, number]),
    ...[...text.matchAll(/https?:\/\/[^\s]+|[A-Za-z][A-Za-z0-9_]*(?:[-'][A-Za-z][A-Za-z0-9_]*)*/g)].map(match => [match.index!, match.index! + match[0].length] as [number, number]),
  ];
  const parts: string[] = [];
  let start = 0;
  while (start < graphemes.length) {
    let end = Math.min(start + capacity, graphemes.length);
    while (end < graphemes.length) {
      const offset = graphemes[end].index;
      const crossing = protectedRanges.find(([from, to]) => from < offset && to > offset);
      if (!crossing) break;
      while (end > start && graphemes[end].index > crossing[0]) end--;
      if (end === start) throw new Error('An indivisible source quantity, word or URL exceeds readable slide capacity; restructure the source explicitly');
    }
    const from = graphemes[start].index, to = end === graphemes.length ? text.length : graphemes[end].index;
    parts.push(text.slice(from, to)); start = end;
  }
  return parts.length ? parts : [text];
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
  const preflight = deck.slides.map(slide => ({ slide: slide.id, ...runMechanicalQa({ pageWidth: 13.33, pageHeight: 7.5, rects: [],
    blocks: [{ id: 'title', type: 'text', text: slide.title }, ...slide.blocks.map((block, i) => ({ ...block, id: `block-${i}` }))] }) }));
  if (preflight.some(check => !check.ok)) {
    const issues = preflight.flatMap((check, i) => check.findings.filter(f => f.severity === 'error').map(f => ({ slide: i + 1, rule: f.check, severity: 'error' as const, message: f.message })));
    return { passed: false, mechanical: { pass: false, slides: preflight },
      visual: { overall: 0, slides: [], issues, revision: [] }, native: { status: 'NOT_ATTEMPTED' } };
  }
  const scenes = resolveDeckScenes(deck, { resolveRects: (slide) => resolveLayout(slide.layout ?? layoutFor(slide)) });
  const slides = deck.slides.map((slide, index) => {
    const scene = scenes[index];
    const content = scene.commands.filter((command) => command.role === 'content');
    const rects = content.map(({ id, rect }) => ({ id, ...rect }));
    const check = runMechanicalQa({
      pageWidth: 13.33,
      pageHeight: 7.5,
      rects,
      blocks: [{ id: 'title', type: 'text', text: slide.title }, ...slide.blocks.map((block, blockIndex) => ({ ...block, id: `block-${blockIndex}` }))],
    });
    // Decorations intentionally surround content, so they are excluded from
    // overlap scoring. Their real output bounds still must fit the canvas.
    for (const command of scene.commands.filter((command) => command.role === 'decoration')) {
      const { x, y, w, h } = command.rect;
      if (![x, y, w, h].every(Number.isFinite) || x < -0.001 || y < -0.001 || x + w > 13.334 || y + h > 7.501 || w < 0 || h < 0) {
        check.findings.push({ check: 'render-command-bounds', severity: 'error', itemId: command.id,
          message: `Rendered decoration ${command.id} has invalid bounds` });
        check.ok = false;
      }
    }
    mechanical.push({ slide: slide.id, ...check });
    const backgroundFor = (command: typeof content[number]): string => {
      const own = (command.options.fill as any)?.color;
      if (typeof own === 'string') return own;
      const behind = scene.commands.slice(0, scene.commands.indexOf(command)).reverse().find(candidate =>
        typeof (candidate.options.fill as any)?.color === 'string' && candidate.rect.x <= command.rect.x && candidate.rect.y <= command.rect.y &&
        candidate.rect.x + candidate.rect.w >= command.rect.x + command.rect.w && candidate.rect.y + candidate.rect.h >= command.rect.y + command.rect.h);
      return (behind?.options.fill as any)?.color ?? scene.background.color;
    };
    return {
      index: index + 1,
      kind: scene.kind,
      title: slide.title,
      blocks: content.map((command) => ({
          id: command.id,
          kind: command.sourceBlockIndex === undefined ? 'title' : command.type === 'text' ? 'body' : command.type,
          text: command.type === 'table' ? (command.rows ?? []).flat().map((cell: any) => typeof cell === 'string' ? cell : cell.text ?? '').join(' ') : command.text,
          rect: command.rect,
          style: {
            fontSize: Number(command.options.fontSize ?? 12),
            color: typeof command.options.color === 'string' ? command.options.color : scene.theme.font,
            bg: backgroundFor(command),
          },
        })),
    };
  });

  const visual = runVisualQa(slides);
  // Unreadable text is a publication error, including theme-derived defaults.
  // Cells have individual fills, so a table-level style alone is insufficient.
  for (const issue of visual.issues) if (issue.rule === 'contrast') issue.severity = 'error';
  for (const scene of scenes) for (const command of scene.commands.filter(c => c.type === 'table')) {
    for (const [rowIndex, row] of (command.rows ?? []).entries()) for (const [columnIndex, cell] of row.entries()) {
      const options = (cell as { options?: { color?: string; fill?: string } }).options;
      if (options?.color && options.fill && contrast(options.color, options.fill) < 3) {
        visual.issues.push({ slide: scene.index + 1, rule: 'contrast', severity: 'error',
          message: `Table cell ${rowIndex + 1},${columnIndex + 1} has unreadable contrast (${options.color}/${options.fill})` });
      }
    }
  }
  const mechanicalPass = mechanical.every((check) => check.ok && !check.findings.some((finding: any) => ['overflow', 'overlap'].includes(finding.check)));
  return {
    passed: mechanicalPass && !visual.issues.some((issue) => issue.severity === 'error'),
    mechanical: { pass: mechanicalPass, slides: mechanical },
    visual,
    native: { status: 'NOT_ATTEMPTED' },
  };
}
