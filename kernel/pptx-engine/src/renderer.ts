// PPTX Renderer（总方案 PHASE 7）：DeckSpec + 几何 → PptxGenJS → 可编辑 PPTX
// 约定：slide.blocks[i] 对应 slide.layout.children[i]（id=block-<i>）
import * as pptxgenNS from 'pptxgenjs';
import type { Rect, LayoutIR } from './layout-engine.js';
import { copyFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';

// pptxgenjs 为 CJS：NodeNext 下 default 指向类本身
const PptxGenJS = (pptxgenNS as unknown as { default?: new () => PptxGenJSLike }).default ?? (pptxgenNS as unknown as new () => PptxGenJSLike);

interface PptxGenJSLike {
  defineLayout(o: { name: string; width: number; height: number }): void;
  layout: string;
  author: string;
  title: string;
  addSlide(): SlideLike;
  writeFile(o: { fileName: string }): Promise<unknown>;
}

interface SlideLike {
  background: { color: string };
  addText(t: string, o: Record<string, unknown>): void;
  addShape(shape: string, o: Record<string, unknown>): void;
  addTable(rows: string[][], o: Record<string, unknown>): void;
  addChart(type: string, data: unknown[], o: Record<string, unknown>): void;
  addImage(o: Record<string, unknown>): void;
  addNotes(n: string): void;
}

export interface SlideBlock {
  type: string;
  text?: string;
  style?: string;
  fontScale?: number;
  color?: string;
  src?: string;
  alt?: string;
  chartType?: string;
  data?: { labels: string[]; series: Array<{ name: string; values: number[] }> };
  headers?: string[];
  rows?: string[][];
  shape?: string;
  label?: string;
  svg?: string;
}

export interface DeckSlide {
  id: string;
  kind: string;
  title: string;
  blocks: SlideBlock[];
  notes?: string;
  layout?: LayoutIR;
}

export interface DeckSpec {
  schema?: 'deck-spec';
  version?: '1';
  title: string;
  subtitle?: string;
  author?: string;
  designTokens?: Record<string, unknown>;
  slides: DeckSlide[];
}

export interface RenderOptions {
  outPath: string;
  /** layout 解析器：slide → Map<blockId, Rect> */
  resolveRects: (slide: DeckSlide) => Map<string, Rect>;
  /** Template DNA 注入：用参考模板 accent/fontFamily 覆盖默认视觉（PHASE 13 P0） */
  dna?: { accent: string; fontFamily?: string };
}

const KIND_THEME: Record<string, { fill: string; accent: string; font: string; fontFamily: string }> = {
  cover: { fill: '1F2937', accent: '60A5FA', font: 'FFFFFF', fontFamily: 'Segoe UI' },
  toc: { fill: 'FFFFFF', accent: '1F2937', font: '111827', fontFamily: 'Segoe UI' },
  section: { fill: '111827', accent: 'F59E0B', font: 'FFFFFF', fontFamily: 'Segoe UI' },
  content: { fill: 'FFFFFF', accent: '2563EB', font: '111827', fontFamily: 'Segoe UI' },
  data: { fill: 'FFFFFF', accent: '0EA5E9', font: '111827', fontFamily: 'Segoe UI' },
  quote: { fill: 'F3F4F6', accent: '6B7280', font: '111827', fontFamily: 'Segoe UI' },
  summary: { fill: 'F8FAFC', accent: '10B981', font: '111827', fontFamily: 'Segoe UI' },
  ending: { fill: '1F2937', accent: 'F59E0B', font: 'FFFFFF', fontFamily: 'Segoe UI' },
};

export function themeFor(kind: string, dna?: RenderOptions['dna']): { fill: string; accent: string; font: string; fontFamily: string } {
  const t = KIND_THEME[kind] ?? KIND_THEME.content;
  if (!dna) return t;
  return { ...t, accent: dna.accent, fontFamily: dna.fontFamily ?? t.fontFamily };
}

export function resolveSlideScene(slide: DeckSlide, resolveRects: RenderOptions['resolveRects'], dna?: RenderOptions['dna']) {
  const rects = resolveRects(slide);
  return {
    theme: themeFor(slide.kind, dna),
    title: { rect: { x: 0.6, y: 0.35, w: 12.1, h: 0.8 }, fontSize: 28 },
    blocks: slide.blocks.map((block, i) => ({ id: `block-${i}`, block, rect: rects.get(`block-${i}`) ?? fallbackRect(i), fontSize: block.type === 'text' ? Math.round(fontSizeFor(block.style) * (block.fontScale ?? 1) * 10) / 10 : 12 })),
  };
}

export async function renderDeck(deck: DeckSpec, opts: RenderOptions): Promise<{ path: string; slideCount: number }> {
  const p = new PptxGenJS();
  p.defineLayout({ name: 'PRES_16x9', width: 13.33, height: 7.5 });
  p.layout = 'PRES_16x9';
  if (deck.author) p.author = deck.author;
  p.title = deck.title;

  for (const slide of deck.slides) {
    const scene = resolveSlideScene(slide, opts.resolveRects, opts.dna);
    const theme = scene.theme;
    const s = p.addSlide();
    s.background = { color: theme.fill };
    // 顶部标题条
    s.addText(slide.title, {
      ...scene.title.rect,
      fontSize: scene.title.fontSize, bold: true, color: theme.font, fontFace: theme.fontFamily,
    });
    s.addShape('rect', { x: 0.6, y: 1.15, w: 1.2, h: 0.06, fill: { color: theme.accent }, line: { color: theme.accent } });
    for (const { block, rect } of scene.blocks) {
      await placeBlock(s, block, rect, theme);
    }
    if (slide.notes) {
      s.addNotes(slide.notes);
    }
  }

  const temporary = `${opts.outPath}.${randomUUID()}.tmp.pptx`;
  try {
    await p.writeFile({ fileName: temporary });
    await copyFile(temporary, opts.outPath, constants.COPYFILE_EXCL);
  } finally { await unlink(temporary).catch(() => undefined); }
  return { path: opts.outPath, slideCount: deck.slides.length };
}

function fallbackRect(i: number): Rect {
  return { x: 0.6, y: 1.6 + i * 1.0, w: 12.1, h: 0.8 };
}

async function placeBlock(s: SlideLike, block: SlideBlock, rect: Rect, theme: { accent: string; font: string; fontFamily: string }): Promise<void> {
  const base = { x: rect.x, y: rect.y, w: rect.w, h: rect.h } as const;
  switch (block.type) {
    case 'text': {
      const color = block.color ?? theme.font;
      const fontSize = Math.round((fontSizeFor(block.style) * (block.fontScale ?? 1)) * 10) / 10;
      s.addText(block.text ?? '', {
        ...base,
        fontSize, color,
        valign: 'top', fontFace: theme.fontFamily, wrap: true, fit: 'shrink',
      });
      break;
    }
    case 'table': {
      const headers = block.headers ?? [];
      const rows = block.rows ?? [];
      s.addTable([headers, ...rows], {
        ...base,
        border: { pt: 0.5, color: 'D1D5DB' },
        fill: { color: 'F9FAFB' },
        fontSize: 12, color: '111827',
      });
      break;
    }
    case 'chart': {
      const d = block.data;
      if (!d) throw new Error('chart block requires data');
      // PptxGenJS 无 'column' 类型；'column'（垂直柱状）映射为 'bar'
      const rawType = block.chartType ?? 'bar';
      const type = (rawType === 'column' ? 'bar' : rawType) as 'bar' | 'line' | 'pie' | 'scatter';
      const chartData = d.series.map((se) => ({ name: se.name, labels: d.labels, values: se.values }));
      s.addChart(type, chartData, {
        ...base,
        chartColors: ['2563EB', 'F59E0B', '10B981', 'EF4444'],
        catAxisLabelColor: theme.font,
        valAxisLabelColor: theme.font,
        legendColor: theme.font,
        showLegend: true,
      });
      break;
    }
    case 'shape': {
      const shape = (block.shape ?? 'rect') as 'rect' | 'roundRect' | 'circle' | 'line' | 'arrow';
      const props: Record<string, unknown> = {
        ...base,
        fill: { color: theme.accent },
        line: { color: theme.accent },
      };
      if (shape === 'circle') { props.w = Math.min(rect.w, rect.h); props.h = props.w; }
      if (shape === 'line' || shape === 'arrow') {
        props.line = { color: theme.accent, width: 2 };
        if (shape === 'arrow') { s.addShape('line', { ...base, line: { color: theme.accent, width: 2 }, beginArrow: { type: 'none' }, endArrow: { type: 'triangle' } } as never); break; }
        s.addShape('line', { ...base, line: { color: theme.accent, width: 2 } } as never); break;
      }
      s.addShape(shape, props as never);
      if (block.label) {
        s.addText(block.label, { x: rect.x, y: rect.y + rect.h / 2 - 0.15, w: rect.w, h: 0.3, align: 'center', fontSize: 12, color: 'FFFFFF' });
      }
      break;
    }
    case 'image': {
      if (block.src && block.src.startsWith('http')) {
        s.addImage({ ...base, path: block.src });
      } else if (block.src) {
        s.addImage({ ...base, path: block.src });
      } else throw new Error('image block requires src');
      break;
    }
    case 'svg': {
      throw new Error('SVG rendering is not verified; refusing to silently drop content');
    }
    default:
      throw new Error(`unsupported block: ${block.type}`);
  }
}

export function fontSizeFor(style: string | undefined): number {
  switch (style) {
    case 'h1': return 36;
    case 'h2': return 28;
    case 'h3': return 22;
    case 'small': return 12;
    case 'caption': return 11;
    default: return 16;
  }
}
