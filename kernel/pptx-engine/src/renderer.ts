// PPTX Renderer（总方案 PHASE 7 / P06）：DeckSpec + 几何 → PptxGenJS → 高保真现代企业级可编辑 PPTX
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
  addTable(rows: unknown[][], o: Record<string, unknown>): void;
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
  cover: { fill: '0B132B', accent: '38BDF8', font: 'FFFFFF', fontFamily: 'Microsoft YaHei' },
  toc: { fill: 'F8FAFC', accent: '1F2937', font: '0F172A', fontFamily: 'Microsoft YaHei' },
  section: { fill: '0F172A', accent: '38BDF8', font: 'FFFFFF', fontFamily: 'Microsoft YaHei' },
  content: { fill: 'F8FAFC', accent: '2563EB', font: '0F172A', fontFamily: 'Microsoft YaHei' },
  data: { fill: 'F8FAFC', accent: '0EA5E9', font: '0F172A', fontFamily: 'Microsoft YaHei' },
  quote: { fill: 'F1F5F9', accent: '64748B', font: '0F172A', fontFamily: 'Microsoft YaHei' },
  summary: { fill: 'F8FAFC', accent: '10B981', font: '0F172A', fontFamily: 'Microsoft YaHei' },
  ending: { fill: '0B132B', accent: '38BDF8', font: 'FFFFFF', fontFamily: 'Microsoft YaHei' },
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
    title: { rect: { x: 0.8, y: 0.75, w: 11.7, h: 0.7 }, fontSize: 26 },
    blocks: slide.blocks.map((block, i) => ({
      id: `block-${i}`,
      block,
      rect: rects.get(`block-${i}`) ?? fallbackRect(i),
      fontSize: block.type === 'text' ? Math.round(fontSizeFor(block.style) * (block.fontScale ?? 1) * 10) / 10 : 12,
    })),
  };
}

function parseMetricCard(text: string): { metric: string | null; desc: string } {
  const metricMatch = /((\$|¥)?\d+(?:\.\d+)?\s*(?:万元|亿元|万|亿|千|台|家|位|个|次|%|ms|GB|TB))/.exec(text);
  if (metricMatch) {
    return {
      metric: metricMatch[1],
      desc: text.replace(/^[-*•]\s*/, '').trim(),
    };
  }
  return { metric: null, desc: text.replace(/^[-*•]\s*/, '').trim() };
}

export async function renderDeck(deck: DeckSpec, opts: RenderOptions): Promise<{ path: string; slideCount: number }> {
  const p = new PptxGenJS();
  p.defineLayout({ name: 'PRES_16x9', width: 13.33, height: 7.5 });
  p.layout = 'PRES_16x9';
  if (deck.author) p.author = deck.author;
  p.title = deck.title;

  for (let idx = 0; idx < deck.slides.length; idx++) {
    const slide = deck.slides[idx];
    const scene = resolveSlideScene(slide, opts.resolveRects, opts.dna);
    const theme = scene.theme;
    const s = p.addSlide();

    if (slide.kind === 'cover') {
      renderCoverSlide(s, slide, deck, theme);
    } else {
      await renderContentSlide(s, slide, deck, theme, scene, idx, deck.slides.length);
    }

    if (slide.notes) {
      s.addNotes(slide.notes);
    }
  }

  const temporary = `${opts.outPath}.${randomUUID()}.tmp.pptx`;
  try {
    await p.writeFile({ fileName: temporary });
    await copyFile(temporary, opts.outPath, constants.COPYFILE_EXCL);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return { path: opts.outPath, slideCount: deck.slides.length };
}

function renderCoverSlide(
  s: SlideLike,
  slide: DeckSlide,
  deck: DeckSpec,
  theme: { fill: string; accent: string; font: string; fontFamily: string }
) {
  // 1. 深邃高端极简暗色背景
  s.background = { color: '0B132B' };

  // 2. 顶部精致胶囊徽标
  s.addShape('roundRect', {
    x: 1.2,
    y: 1.5,
    w: 3.6,
    h: 0.4,
    fill: { color: '1E293B' },
    line: { color: '38BDF8', width: 1.5 },
    rectRadius: 0.2,
  });
  s.addText('[ 2026 战略发布 · 商业汇报 ]', {
    x: 1.2,
    y: 1.5,
    w: 3.6,
    h: 0.4,
    fontSize: 11,
    bold: true,
    color: '38BDF8',
    fontFace: theme.fontFamily,
    align: 'center',
    valign: 'middle',
  });

  // 3. 核心大标题（38pt 超粗体，大字号呼吸感）
  s.addText(slide.title, {
    x: 1.2,
    y: 2.15,
    w: 10.9,
    h: 1.5,
    fontSize: 38,
    bold: true,
    color: 'FFFFFF',
    fontFace: theme.fontFamily,
    valign: 'top',
  });

  // 4. 现代强调装饰条
  s.addShape('roundRect', {
    x: 1.2,
    y: 3.9,
    w: 2.8,
    h: 0.08,
    fill: { color: theme.accent || '38BDF8' },
    line: { color: theme.accent || '38BDF8', width: 1 },
    rectRadius: 0.04,
  });

  // 5. 副标题 / 战略宣言
  const subtitle = deck.subtitle || (slide.blocks[0]?.type === 'text' && slide.blocks[0].text ? slide.blocks[0].text : '') || '新一代智能化商业战略规划与核心业务成果落地实践';
  s.addText(subtitle, {
    x: 1.2,
    y: 4.2,
    w: 10.9,
    h: 1.2,
    fontSize: 18,
    color: '94A3B8',
    fontFace: theme.fontFamily,
    valign: 'top',
  });

  // 6. 底部权威元信息
  s.addText(`PresentationOS AI Engine · ${deck.author ?? '企业战略'} · 商业机密 · 100% 事实保真`, {
    x: 1.2,
    y: 6.3,
    w: 10.9,
    h: 0.4,
    fontSize: 12,
    color: '64748B',
    fontFace: theme.fontFamily,
    valign: 'bottom',
  });
}

function classifySlideArchetype(slide: DeckSlide): 'table' | 'chart' | 'timeline' | 'comparison' | 'process' | 'quote' | 'cardGrid' | 'flow' {
  const hasTable = slide.blocks.some((b) => b.type === 'table');
  const hasChart = slide.blocks.some((b) => b.type === 'chart');
  const hasOther = slide.blocks.some((b) => b.type !== 'text' && b.type !== 'table' && b.type !== 'chart');

  if (hasTable && !hasOther) return 'table';
  if (hasChart && !hasOther) return 'chart';

  const textBlocks = slide.blocks.filter((b) => b.type === 'text');
  if (textBlocks.length === 0 || hasOther) return 'flow';

  // 1. Quote archetype: single text block with style 'quote' or title containing '宣言' / '愿景' / '金句' or starts with '>'
  if (textBlocks.length === 1 && (slide.kind === 'quote' || textBlocks[0].style === 'quote' || /愿景|金句|宣言|使命|takeaway|quote/i.test(slide.title) || (textBlocks[0].text && textBlocks[0].text.startsWith('>')))) {
    return 'quote';
  }

  // 2. Comparison archetype: 2 text blocks with contrasting words
  if (textBlocks.length === 2) {
    const isCompareTitle = /对比|差异|vs|优劣|传统.*(创新|新一代|现代化)|现状.*目标|before.*after/i.test(slide.title);
    const hasContrastWords = textBlocks.some(b => /传统|现状|痛点|缺点|方案一|旧架构|原有|人工/i.test(b.text ?? '')) &&
                             textBlocks.some(b => /创新|突破|优势|方案二|新架构|成果|目标|智能|自动化/i.test(b.text ?? ''));
    if (isCompareTitle || hasContrastWords) {
      return 'comparison';
    }
  }

  // 3. Timeline archetype: dates / years / quarters / roadmap
  const isTimelineTitle = /时间|路线|规划|发展历程|里程碑|roadmap|timeline|阶段/i.test(slide.title);
  const datePattern = /(20\d\d年?|q[1-4]|第[一二三四1-4]阶段|phase\s*\d|stage\s*\d|年度)/i;
  const dateMatches = textBlocks.filter(b => datePattern.test(b.text ?? '')).length;
  if ((isTimelineTitle && textBlocks.length >= 2 && textBlocks.length <= 5) || (dateMatches >= 2 && dateMatches === textBlocks.length)) {
    return 'timeline';
  }

  // 4. Process Flow archetype: steps / workflow
  const isProcessTitle = /流程|步骤|实施路径|闭环|架构推进|process|workflow|steps/i.test(slide.title);
  const stepPattern = /^(第[一二三四1-4]步|步骤[一二三四1-4]|step\s*\d|[0-9][\.\、\s])/i;
  const stepMatches = textBlocks.filter(b => stepPattern.test(b.text?.trim() ?? '')).length;
  if ((isProcessTitle && textBlocks.length >= 2 && textBlocks.length <= 5) || (stepMatches >= 2 && stepMatches === textBlocks.length)) {
    return 'process';
  }

  // 5. Card Grid: 2 to 4 text blocks
  if (textBlocks.length >= 2 && textBlocks.length <= 4) {
    return 'cardGrid';
  }

  return 'flow';
}

function archetypeBadgeText(archetype: string): string {
  switch (archetype) {
    case 'timeline': return '[ 发展历程 · 路线规划 ]';
    case 'comparison': return '[ 方案对比 · 价值分析 ]';
    case 'process': return '[ 实施路径 · 闭环流程 ]';
    case 'quote': return '[ 战略愿景 · 核心宣言 ]';
    case 'table': return '[ 数据详述 · 核心指标 ]';
    case 'cardGrid': return '[ 核心指标 · 关键成果 ]';
    default: return '[ 核心汇报 ]';
  }
}

async function renderContentSlide(
  s: SlideLike,
  slide: DeckSlide,
  deck: DeckSpec,
  theme: { fill: string; accent: string; font: string; fontFamily: string },
  scene: ReturnType<typeof resolveSlideScene>,
  slideIndex: number,
  totalSlides: number
) {
  // 1. 现代温润浅灰底色（告别刺眼纯白与空洞）
  s.background = { color: 'F8FAFC' };

  const archetype = classifySlideArchetype(slide);
  const badgeLabel = archetypeBadgeText(archetype);
  const badgeW = Math.max(2.4, badgeLabel.length * 0.22);

  // 2. 顶部微型分类标签（按语义动态生成）
  s.addShape('roundRect', {
    x: 0.8,
    y: 0.42,
    w: badgeW,
    h: 0.32,
    fill: { color: 'EFF6FF' },
    line: { color: 'BFDBFE', width: 1 },
    rectRadius: 0.15,
  });
  s.addText(badgeLabel, {
    x: 0.8,
    y: 0.42,
    w: badgeW,
    h: 0.32,
    fontSize: 10,
    bold: true,
    color: '2563EB',
    fontFace: theme.fontFamily,
    align: 'center',
    valign: 'middle',
  });

  // 3. 页面大标题（26pt 极简深色）
  s.addText(slide.title, {
    x: 0.8,
    y: 0.78,
    w: 11.7,
    h: 0.65,
    fontSize: 26,
    bold: true,
    color: '0F172A',
    fontFace: theme.fontFamily,
    valign: 'top',
  });

  // 4. 精致强调下划条
  s.addShape('roundRect', {
    x: 0.8,
    y: 1.48,
    w: 1.8,
    h: 0.05,
    fill: { color: theme.accent || '2563EB' },
    line: { color: theme.accent || '2563EB', width: 1 },
    rectRadius: 0.02,
  });

  // 5. 底部页码与品牌标记
  s.addText(`PresentationOS 智能演示系统 · 商业保密报告`, {
    x: 0.8,
    y: 6.9,
    w: 5.0,
    h: 0.3,
    fontSize: 10,
    color: '94A3B8',
    fontFace: theme.fontFamily,
  });
  s.addText(`第 ${slideIndex + 1} 页 / 共 ${totalSlides} 页`, {
    x: 10.5,
    y: 6.9,
    w: 2.0,
    h: 0.3,
    fontSize: 10,
    color: '94A3B8',
    fontFace: theme.fontFamily,
    align: 'right',
  });

  // 6. 内容区块渲染：根据语义架构分流
  const textBlocks = slide.blocks.filter((b) => b.type === 'text');
  switch (archetype) {
    case 'table': {
      const tableBlock = slide.blocks.find((b) => b.type === 'table')!;
      renderExecutiveTable(s, tableBlock, theme);
      return;
    }
    case 'chart': {
      for (const { block, rect } of scene.blocks) {
        await placeBlock(s, block, rect, theme);
      }
      return;
    }
    case 'quote': {
      renderQuoteSlide(s, textBlocks[0], theme);
      return;
    }
    case 'comparison': {
      renderComparison(s, textBlocks, theme);
      return;
    }
    case 'timeline': {
      renderTimeline(s, textBlocks, theme);
      return;
    }
    case 'process': {
      renderProcessSteps(s, textBlocks, theme);
      return;
    }
    case 'cardGrid': {
      renderCardGrid(s, textBlocks, theme);
      return;
    }
    default: {
      await renderFlowCards(s, scene.blocks, theme);
      return;
    }
  }
}

function renderComparison(
  s: SlideLike,
  blocks: SlideBlock[],
  theme: { accent: string; font: string; fontFamily: string }
) {
  const cardW = 5.65;
  const cardH = 4.8;
  const cardY = 1.8;

  // Left Card: 传统模式 / 现状痛点
  const leftX = 0.8;
  s.addShape('roundRect', {
    x: leftX,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: 'F1F5F9' },
    line: { color: 'CBD5E1', width: 1.5 },
    rectRadius: 0.12,
  });
  // Left top pill badge
  s.addShape('roundRect', {
    x: leftX + 0.35,
    y: cardY + 0.35,
    w: 2.5,
    h: 0.38,
    fill: { color: 'E2E8F0' },
    line: { color: '94A3B8', width: 1 },
    rectRadius: 0.1,
  });
  s.addText('传统痛点 / BEFORE', {
    x: leftX + 0.35,
    y: cardY + 0.35,
    w: 2.5,
    h: 0.38,
    fontSize: 11,
    bold: true,
    color: '475569',
    fontFace: theme.fontFamily,
    align: 'center',
    valign: 'middle',
  });
  // Left content
  s.addText(blocks[0].text ?? '', {
    x: leftX + 0.35,
    y: cardY + 1.0,
    w: cardW - 0.7,
    h: cardH - 1.3,
    fontSize: 14,
    color: '475569',
    fontFace: theme.fontFamily,
    valign: 'top',
    wrap: true,
  });

  // Right Card: 现代化方案 / AI 突破 (Elevated)
  const rightX = 6.88;
  s.addShape('roundRect', {
    x: rightX,
    y: cardY,
    w: cardW,
    h: cardH,
    fill: { color: 'FFFFFF' },
    line: { color: theme.accent || '2563EB', width: 2 },
    rectRadius: 0.12,
  });
  // Right top accent bar
  s.addShape('roundRect', {
    x: rightX + 0.1,
    y: cardY + 0.08,
    w: cardW - 0.2,
    h: 0.06,
    fill: { color: theme.accent || '2563EB' },
    line: { color: theme.accent || '2563EB', width: 1 },
    rectRadius: 0.03,
  });
  // Right top pill badge
  s.addShape('roundRect', {
    x: rightX + 0.35,
    y: cardY + 0.35,
    w: 2.7,
    h: 0.38,
    fill: { color: 'EFF6FF' },
    line: { color: '93C5FD', width: 1 },
    rectRadius: 0.1,
  });
  s.addText('核心突破 / AFTER', {
    x: rightX + 0.35,
    y: cardY + 0.35,
    w: 2.7,
    h: 0.38,
    fontSize: 11,
    bold: true,
    color: '1D4ED8',
    fontFace: theme.fontFamily,
    align: 'center',
    valign: 'middle',
  });
  // Right content
  s.addText(blocks[1].text ?? '', {
    x: rightX + 0.35,
    y: cardY + 1.0,
    w: cardW - 0.7,
    h: cardH - 1.3,
    fontSize: 14,
    bold: true,
    color: '0F172A',
    fontFace: theme.fontFamily,
    valign: 'top',
    wrap: true,
  });

  // Center "VS" circle badge
  s.addShape('roundRect', {
    x: 6.07,
    y: cardY + 1.9,
    w: 1.2,
    h: 0.7,
    fill: { color: '0F172A' },
    line: { color: '38BDF8', width: 2 },
    rectRadius: 0.2,
  });
  s.addText('VS', {
    x: 6.07,
    y: cardY + 1.9,
    w: 1.2,
    h: 0.7,
    fontSize: 16,
    bold: true,
    color: '38BDF8',
    fontFace: theme.fontFamily,
    align: 'center',
    valign: 'middle',
  });
}

function renderTimeline(
  s: SlideLike,
  blocks: SlideBlock[],
  theme: { accent: string; font: string; fontFamily: string }
) {
  const count = blocks.length;
  const startX = 0.8;
  const totalW = 11.73;
  const gap = count === 4 ? 0.3 : 0.45;
  const cardW = Math.round(((totalW - (count - 1) * gap) / count) * 100) / 100;
  const lineY = 2.4;

  // Horizontal connecting pipeline
  s.addShape('roundRect', {
    x: startX + 0.5,
    y: lineY,
    w: totalW - 1.0,
    h: 0.06,
    fill: { color: 'CBD5E1' },
    line: { color: 'CBD5E1', width: 1 },
    rectRadius: 0.03,
  });

  for (let i = 0; i < count; i++) {
    const block = blocks[i];
    const x = startX + i * (cardW + gap);
    const centerX = x + cardW / 2;

    // Node Outer Ring
    s.addShape('roundRect', {
      x: centerX - 0.22,
      y: lineY - 0.19,
      w: 0.44,
      h: 0.44,
      fill: { color: 'EFF6FF' },
      line: { color: theme.accent || '2563EB', width: 2 },
      rectRadius: 0.22,
    });
    // Node Inner Center
    s.addShape('roundRect', {
      x: centerX - 0.1,
      y: lineY - 0.07,
      w: 0.2,
      h: 0.2,
      fill: { color: theme.accent || '2563EB' },
      line: { color: theme.accent || '2563EB', width: 1 },
      rectRadius: 0.1,
    });

    // Milestone Date Badge above node
    const dateMatch = /(20\d\d年?|Q[1-4]|第[一二三四1-4]阶段|Phase\s*\d|Stage\s*\d)/i.exec(block.text ?? '');
    const dateText = dateMatch ? dateMatch[1] : `Phase 0${i + 1}`;
    s.addShape('roundRect', {
      x: centerX - 0.8,
      y: 1.7,
      w: 1.6,
      h: 0.42,
      fill: { color: '0F172A' },
      line: { color: '38BDF8', width: 1.5 },
      rectRadius: 0.12,
    });
    s.addText(dateText, {
      x: centerX - 0.8,
      y: 1.7,
      w: 1.6,
      h: 0.42,
      fontSize: 12,
      bold: true,
      color: '38BDF8',
      fontFace: theme.fontFamily,
      align: 'center',
      valign: 'middle',
    });

    // Milestone Content Card below node
    s.addShape('roundRect', {
      x,
      y: 2.85,
      w: cardW,
      h: 3.75,
      fill: { color: 'FFFFFF' },
      line: { color: 'E2E8F0', width: 1.5 },
      rectRadius: 0.12,
    });
    // Top highlight line
    s.addShape('roundRect', {
      x: x + 0.1,
      y: 2.93,
      w: cardW - 0.2,
      h: 0.05,
      fill: { color: theme.accent || '2563EB' },
      line: { color: theme.accent || '2563EB', width: 1 },
      rectRadius: 0.02,
    });
    // Body Text
    const bodyText = block.text ? block.text.replace(dateText, '').replace(/^[-*•:\s：]+/, '').trim() : '';
    s.addText(bodyText || (block.text ?? ''), {
      x: x + 0.3,
      y: 3.2,
      w: cardW - 0.6,
      h: 3.1,
      fontSize: 13,
      color: '334155',
      fontFace: theme.fontFamily,
      valign: 'top',
      wrap: true,
    });
  }
}

function renderProcessSteps(
  s: SlideLike,
  blocks: SlideBlock[],
  theme: { accent: string; font: string; fontFamily: string }
) {
  const count = blocks.length;
  const startX = 0.8;
  const totalW = 11.73;
  const gap = count === 4 ? 0.3 : 0.4;
  const cardW = Math.round(((totalW - (count - 1) * gap) / count) * 100) / 100;
  const cardY = 1.9;
  const cardH = 4.6;

  for (let i = 0; i < count; i++) {
    const block = blocks[i];
    const x = startX + i * (cardW + gap);

    // Step Card
    s.addShape('roundRect', {
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: 'E2E8F0', width: 1.5 },
      rectRadius: 0.12,
    });
    // Top Accent line
    s.addShape('roundRect', {
      x: x + 0.1,
      y: cardY + 0.08,
      w: cardW - 0.2,
      h: 0.05,
      fill: { color: theme.accent || '2563EB' },
      line: { color: theme.accent || '2563EB', width: 1 },
      rectRadius: 0.02,
    });

    // Step Number Badge (e.g. STEP 01)
    s.addShape('roundRect', {
      x: x + 0.3,
      y: cardY + 0.35,
      w: 1.1,
      h: 0.35,
      fill: { color: 'EFF6FF' },
      line: { color: 'BFDBFE', width: 1 },
      rectRadius: 0.08,
    });
    s.addText(`STEP 0${i + 1}`, {
      x: x + 0.3,
      y: cardY + 0.35,
      w: 1.1,
      h: 0.35,
      fontSize: 11,
      bold: true,
      color: '1D4ED8',
      fontFace: theme.fontFamily,
      align: 'center',
      valign: 'middle',
    });

    // Content text
    const stepClean = block.text ? block.text.replace(/^(第[一二三四1-4]步|步骤[一二三四1-4]|step\s*\d|[0-9][\.\、])[:：\s]*/i, '').trim() : '';
    s.addText(stepClean || (block.text ?? ''), {
      x: x + 0.3,
      y: cardY + 0.95,
      w: cardW - 0.6,
      h: cardH - 1.2,
      fontSize: 14,
      color: '334155',
      fontFace: theme.fontFamily,
      valign: 'top',
      wrap: true,
    });

    // Chevron connector arrow between cards
    if (i < count - 1) {
      const arrowX = x + cardW + gap / 2 - 0.15;
      s.addShape('line', {
        x: arrowX,
        y: cardY + cardH / 2,
        w: 0.3,
        h: 0,
        line: { color: '94A3B8', width: 2 },
      });
    }
  }
}

function renderQuoteSlide(
  s: SlideLike,
  block: SlideBlock,
  theme: { accent: string; font: string; fontFamily: string }
) {
  // Elevated large card backdrop
  s.addShape('roundRect', {
    x: 1.2,
    y: 1.8,
    w: 10.93,
    h: 4.6,
    fill: { color: 'FFFFFF' },
    line: { color: 'E2E8F0', width: 1.5 },
    rectRadius: 0.15,
  });
  // Top accent bar
  s.addShape('roundRect', {
    x: 1.3,
    y: 1.88,
    w: 10.73,
    h: 0.06,
    fill: { color: theme.accent || '2563EB' },
    line: { color: theme.accent || '2563EB', width: 1 },
    rectRadius: 0.03,
  });

  // Giant decorative quote mark
  s.addText('“', {
    x: 1.6,
    y: 2.1,
    w: 1.5,
    h: 1.5,
    fontSize: 72,
    bold: true,
    color: 'E2E8F0',
    fontFace: 'Georgia',
    valign: 'top',
  });

  // Quote content
  const quoteText = block.text ? block.text.replace(/^[>“"”\s]+/, '').replace(/["”\s]+$/, '') : '';
  s.addText(quoteText, {
    x: 2.2,
    y: 2.8,
    w: 8.9,
    h: 2.4,
    fontSize: 24,
    bold: true,
    color: '0F172A',
    fontFace: theme.fontFamily,
    valign: 'middle',
    align: 'center',
    wrap: true,
  });

  // Attribution badge
  s.addShape('roundRect', {
    x: 4.8,
    y: 5.5,
    w: 3.73,
    h: 0.45,
    fill: { color: 'EFF6FF' },
    line: { color: 'BFDBFE', width: 1 },
    rectRadius: 0.12,
  });
  s.addText('PresentationOS · 核心设计战略宣言', {
    x: 4.8,
    y: 5.5,
    w: 3.73,
    h: 0.45,
    fontSize: 12,
    bold: true,
    color: '1D4ED8',
    fontFace: theme.fontFamily,
    align: 'center',
    valign: 'middle',
  });
}

function renderCardGrid(
  s: SlideLike,
  blocks: SlideBlock[],
  theme: { accent: string; font: string; fontFamily: string }
) {
  const count = blocks.length;
  const startX = 0.8;
  const totalW = 11.73;
  const cardGap = count === 4 ? 0.25 : (count === 3 ? 0.38 : 0.5);
  const cardW = Math.round(((totalW - (count - 1) * cardGap) / count) * 100) / 100;
  const cardY = 1.8;
  const cardH = 4.8;

  for (let i = 0; i < count; i++) {
    const block = blocks[i];
    const x = startX + i * (cardW + cardGap);
    const parsed = parseMetricCard(block.text ?? '');

    // 1. 卡片背景底板（纯白圆角微阴影质感，E2E8F0 边框）
    s.addShape('roundRect', {
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: 'E2E8F0', width: 1.5 },
      rectRadius: 0.12,
    });

    // 2. 卡片顶部主题高光线
    s.addShape('roundRect', {
      x: x + 0.1,
      y: cardY + 0.08,
      w: cardW - 0.2,
      h: 0.05,
      fill: { color: theme.accent || '2563EB' },
      line: { color: theme.accent || '2563EB', width: 1 },
      rectRadius: 0.02,
    });

    // 3. 序号指示徽章
    s.addShape('roundRect', {
      x: x + 0.35,
      y: cardY + 0.35,
      w: 0.7,
      h: 0.35,
      fill: { color: 'EFF6FF' },
      line: { color: 'BFDBFE', width: 1 },
      rectRadius: 0.08,
    });
    s.addText(`0${i + 1}`, {
      x: x + 0.35,
      y: cardY + 0.35,
      w: 0.7,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: '1D4ED8',
      fontFace: theme.fontFamily,
      align: 'center',
      valign: 'middle',
    });

    // 4. Hero 指标大数字（如果包含事实数值）
    if (parsed.metric) {
      s.addText(parsed.metric, {
        x: x + 0.35,
        y: cardY + 0.85,
        w: cardW - 0.7,
        h: 0.8,
        fontSize: count === 4 ? 26 : 32,
        bold: true,
        color: '1E3A8A',
        fontFace: theme.fontFamily,
        valign: 'top',
      });

      // 正文详述
      s.addText(parsed.desc, {
        x: x + 0.35,
        y: cardY + 1.8,
        w: cardW - 0.7,
        h: 2.6,
        fontSize: 13,
        color: '475569',
        fontFace: theme.fontFamily,
        valign: 'top',
        wrap: true,
      });
    } else {
      // 普通正文要点排版
      s.addText(block.text ?? '', {
        x: x + 0.35,
        y: cardY + 0.9,
        w: cardW - 0.7,
        h: 3.5,
        fontSize: 14,
        color: '334155',
        fontFace: theme.fontFamily,
        valign: 'top',
        wrap: true,
      });
    }
  }
}

function renderExecutiveTable(
  s: SlideLike,
  block: SlideBlock,
  theme: { accent: string; font: string; fontFamily: string }
) {
  const headers = block.headers ?? [];
  const rows = block.rows ?? [];
  const totalRows = 1 + rows.length;
  const tableX = 0.8;
  const tableY = 1.8;
  const tableW = 11.73;
  const rowH = Math.min(0.7, 4.6 / totalRows);
  const tableH = rowH * totalRows;

  // 卡片容器底框
  s.addShape('roundRect', {
    x: tableX - 0.05,
    y: tableY - 0.05,
    w: tableW + 0.1,
    h: tableH + 0.1,
    fill: { color: 'FFFFFF' },
    line: { color: 'E2E8F0', width: 1.5 },
    rectRadius: 0.1,
  });

  const formattedCells: any[][] = [];

  // 表头（深蓝黑背景，纯白粗体，居中）
  const headerRow = headers.map((h) => ({
    text: h,
    options: {
      fill: { color: '1E293B' },
      color: 'FFFFFF',
      bold: true,
      fontSize: 13,
      fontFace: theme.fontFamily,
      align: 'center',
      valign: 'middle',
    },
  }));
  formattedCells.push(headerRow);

  // 斑马条纹交替数据行
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const isEven = r % 2 === 0;
    const rowBg = isEven ? 'FFFFFF' : 'F8FAFC';

    const formattedRow = row.map((cellText) => {
      const isNumber = /((\$|¥)?\d+(?:[\.,]\d+)?\s*(%|万|亿|千|台|家|位|元)?)$/.test(cellText.trim());
      return {
        text: cellText,
        options: {
          fill: { color: rowBg },
          color: '334155',
          fontSize: 12,
          fontFace: theme.fontFamily,
          align: isNumber ? 'center' : 'left',
          valign: 'middle',
        },
      };
    });
    formattedCells.push(formattedRow);
  }

  s.addTable(formattedCells, {
    x: tableX,
    y: tableY,
    w: tableW,
    h: tableH,
    border: { pt: 0.5, color: 'E2E8F0' },
  });
}

async function renderFlowCards(
  s: SlideLike,
  blocks: Array<{ block: SlideBlock; rect: Rect; fontSize: number }>,
  theme: { accent: string; font: string; fontFamily: string }
) {
  for (let i = 0; i < blocks.length; i++) {
    const { block, rect } = blocks[i];
    if (block.type === 'text') {
      s.addShape('roundRect', {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        fill: { color: 'FFFFFF' },
        line: { color: 'E2E8F0', width: 1.5 },
        rectRadius: 0.1,
      });
      s.addText(block.text ?? '', {
        x: rect.x + 0.35,
        y: rect.y + 0.2,
        w: rect.w - 0.7,
        h: rect.h - 0.4,
        fontSize: 15,
        color: '334155',
        fontFace: theme.fontFamily,
        valign: 'top',
        wrap: true,
      });
    } else {
      await placeBlock(s, block, rect, theme);
    }
  }
}

function fallbackRect(i: number): Rect {
  return { x: 0.8, y: 1.8 + i * 1.2, w: 11.73, h: 1.0 };
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
