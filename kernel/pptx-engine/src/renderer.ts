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

export type DomainCategory = 'business' | 'academic' | 'medical' | 'engineering' | 'education' | 'government';

export interface DomainMeta {
  domain: DomainCategory;
  name: string;
  defaultTheme: ThemePresetName;
  footerTitle: string;
  coverSubtitle: string;
  coverMeta: string;
  badgeMap: Record<string, string>;
}

export const DOMAIN_METAS: Record<DomainCategory, DomainMeta> = {
  academic: {
    domain: 'academic',
    name: '学术科研与高校论文答辩',
    defaultTheme: 'academic-editorial',
    footerTitle: 'PresentationOS 学术科研系统 · 论文答辩与成果研讨 · 100% 严谨保真',
    coverSubtitle: '顶会学术论文答辩与前沿科研实验突破成果汇报',
    coverMeta: '学术科研成果汇报 · 答辩委员会评审 · 严谨保真',
    badgeMap: {
      pyramid: '[ 顶层设计 · 理论基石金字塔 ]',
      architecture: '[ 方法体系 · 算法分层拓扑 ]',
      comparison: '[ SOTA对比 · 理论方法优劣 ]',
      quadrant: '[ 敏感性矩阵 · 消融分析 ]',
      funnel: '[ 样本筛选 · 队列实验漏斗 ]',
      team: '[ 课题组 · 导师与核心作者 ]',
      timeline: '[ 科研路线 · 历史演进里程碑 ]',
      process: '[ 实验方案 · 验证闭环步骤 ]',
      cardGrid: '[ 核心突破 · 评估指标大数 ]',
      table: '[ 实验数据 · Benchmark横评 ]',
      quote: '[ 学术宣言 · 核心科学发现 ]',
      default: '[ 学术汇报 · 核心论点 ]',
    },
  },
  medical: {
    domain: 'medical',
    name: '医疗健康与临床生命科学',
    defaultTheme: 'healthcare-mint',
    footerTitle: 'PresentationOS 医疗健康系统 · 临床科研与循证医学 · 严格审校',
    coverSubtitle: '临床试验队列研究与生命科学新药研发成果汇报',
    coverMeta: '国家医学中心 · IRB伦理审查通过 · 循证真实',
    badgeMap: {
      pyramid: '[ 诊疗规范 · 循证医学层级 ]',
      architecture: '[ 药理机制 · 分子靶点分层 ]',
      comparison: '[ 双盲对照 · 对照组vs试验组 ]',
      quadrant: '[ 风险收益 · 临床指征象限 ]',
      funnel: '[ 患者招募 · 临床入组漏斗 ]',
      team: '[ 临床专家 · PI领军医疗团队 ]',
      timeline: '[ 研发阶段 · 临床试验阶段轴 ]',
      process: '[ 诊疗路径 · 临床转化流程 ]',
      cardGrid: '[ 临床疗效 · 安全有效性指标 ]',
      table: '[ 病例队列 · 临床实验数据表 ]',
      quote: '[ 医学誓言 · 生命健康宣言 ]',
      default: '[ 临床研报 · 医学结论 ]',
    },
  },
  engineering: {
    domain: 'engineering',
    name: '软件工程与前沿技术架构',
    defaultTheme: 'tech-dark',
    footerTitle: 'PresentationOS 极客工程系统 · 技术架构与系统蓝图 · 生产就绪',
    coverSubtitle: '企业级高可用分布式系统架构蓝图与核心内核实践',
    coverMeta: '系统工程架构组 · 生产环境就绪 · 纯原生矢量',
    badgeMap: {
      pyramid: '[ 技术愿景 · 架构分级模型 ]',
      architecture: '[ 系统架构 · 模块分层蓝图 ]',
      comparison: '[ 架构对比 · 传统模式vs云原生 ]',
      quadrant: '[ 选型评估 · 性能成熟度矩阵 ]',
      funnel: '[ 数据流转 · 高并发清洗漏斗 ]',
      team: '[ 核心研发 · 资深架构师阵容 ]',
      timeline: '[ 演进路线 · 版本迭代里程碑 ]',
      process: '[ 部署交付 · 自动化CI/CD流水线 ]',
      cardGrid: '[ 性能压测 · QPS与延迟指标 ]',
      table: '[ 压测基准 · 性能横向对比表 ]',
      quote: '[ 技术宣言 · 代码构建未来 ]',
      default: '[ 技术汇报 · 架构实现 ]',
    },
  },
  business: {
    domain: 'business',
    name: '商业战略与企业经营汇报',
    defaultTheme: 'executive-navy',
    footerTitle: 'PresentationOS 智能演示系统 · 商业战略与经营汇报 · 100% 事实保真',
    coverSubtitle: '新一代智能化商业战略规划与核心业务成果落地实践',
    coverMeta: '企业战略管理中心 · 高管决策参考 · 商业机密 · 事实保真',
    badgeMap: {
      pyramid: '[ 顶层设计 · 战略金字塔 ]',
      architecture: '[ 技术架构 · 分层体系 ]',
      comparison: '[ 方案对比 · 价值分析 ]',
      quadrant: '[ 战略矩阵 · 象限分析 ]',
      funnel: '[ 转化漏斗 · 链路分析 ]',
      team: '[ 核心阵容 · 领军履历 ]',
      timeline: '[ 发展历程 · 路线规划 ]',
      process: '[ 实施路径 · 闭环流程 ]',
      cardGrid: '[ 核心指标 · 关键成果 ]',
      table: '[ 数据详述 · 核心指标 ]',
      quote: '[ 战略愿景 · 核心宣言 ]',
      default: '[ 核心汇报 ]',
    },
  },
  education: {
    domain: 'education',
    name: '教育培训与知识讲义',
    defaultTheme: 'academic-editorial',
    footerTitle: 'PresentationOS 教育培训系统 · 课程讲义与知识沉淀 · 体系赋能',
    coverSubtitle: '高阶专业能力进阶培训讲义与知识图谱实战训练',
    coverMeta: '教学研发展中心 · 课程认证体系 · 体系讲义 · 知识赋能',
    badgeMap: {
      pyramid: '[ 知识体系 · 认知进阶金字塔 ]',
      architecture: '[ 课程结构 · 知识模块拓扑 ]',
      comparison: '[ 概念辨析 · 正误案例对比 ]',
      quadrant: '[ 技能矩阵 · 难易重点象限 ]',
      funnel: '[ 学习漏斗 · 知识吸收路径 ]',
      team: '[ 教学名师 · 专家教研团队 ]',
      timeline: '[ 学习历程 · 阶段通关打卡 ]',
      process: '[ 实战步骤 · 演练实操流程 ]',
      cardGrid: '[ 核心考点 · 关键指标解析 ]',
      table: '[ 知识清单 · 重点掌握清单 ]',
      quote: '[ 教育名言 · 终身学习誓言 ]',
      default: '[ 课程讲授 · 重点精讲 ]',
    },
  },
  government: {
    domain: 'government',
    name: '政务智库与宏观治理',
    defaultTheme: 'academic-editorial',
    footerTitle: 'PresentationOS 智库政务系统 · 政策宣导与治理规划 · 严肃审定',
    coverSubtitle: '公共治理体系现代化与宏观发展规划实效汇编',
    coverMeta: '公共政策智库 · 宏观决策参考 · 权威审校 · 成果通报',
    badgeMap: {
      pyramid: '[ 顶层设计 · 治理架构金字塔 ]',
      architecture: '[ 治理体系 · 部门协同网络 ]',
      comparison: '[ 政策成效 · 改革前后对比 ]',
      quadrant: '[ 民生重点 · 迫切程度矩阵 ]',
      funnel: '[ 诉求办理 · 办结闭环漏斗 ]',
      team: '[ 专家顾问 · 决策智囊团队 ]',
      timeline: '[ 发展规划 · 远景目标路线 ]',
      process: '[ 推进流程 · 落实责任闭环 ]',
      cardGrid: '[ 治理实效 · 惠民成果指标 ]',
      table: '[ 考核明细 · 重点项目进度 ]',
      quote: '[ 施政理念 · 人民至上宣言 ]',
      default: '[ 政策通报 · 决策参考 ]',
    },
  },
};

export function detectDomain(deck: DeckSpec): DomainCategory {
  if (deck.domain && DOMAIN_METAS[deck.domain]) {
    return deck.domain;
  }
  const explicit = (deck.designTokens?.domain as DomainCategory);
  if (explicit && DOMAIN_METAS[explicit]) {
    return explicit;
  }

  const fullText = [
    deck.title,
    deck.subtitle ?? '',
    ...deck.slides.flatMap(s => [s.title, ...s.blocks.map(b => b.text ?? '')])
  ].join(' ');

  const academicScore = (fullText.match(/论文|答辩|实验|数据集|baseline|sota|消融|文献|审稿|arxiv|doi|引用|高校|实验室|导师|硕士|博士|本科|定理|证明/gi) || []).length;
  const medicalScore = (fullText.match(/临床|患者|试验|药物|靶点|双盲|对照组|不良反应|fda|nmpa|医院|医疗|病理|疗效|受试者|医学|细胞|生物|生命|处方/gi) || []).length;
  const techScore = (fullText.match(/微服务|内核|高可用|中间件|分布式|开源|代码|github|qps|吞吐|延迟|api|网关|docker|k8s|数据库|并发|后端|协议/gi) || []).length;
  const eduScore = (fullText.match(/课程|培训|学员|讲义|作业|知识点|复盘|考试|教学|教材|大纲|教师|班级/gi) || []).length;
  const govScore = (fullText.match(/政策|智库|政务|治理|公文|民生|规章|党政|宏观|省委|市委|纪要/gi) || []).length;

  const max = Math.max(academicScore, medicalScore, techScore, eduScore, govScore);
  if (max === 0) return 'business';

  if (medicalScore === max) return 'medical';
  if (academicScore === max) return 'academic';
  if (techScore === max) return 'engineering';
  if (govScore === max) return 'government';
  if (eduScore === max) return 'education';
  return 'business';
}

export interface DeckSpec {
  schema?: 'deck-spec';
  version?: '1';
  title: string;
  subtitle?: string;
  author?: string;
  domain?: DomainCategory;
  designTokens?: Record<string, unknown>;
  slides: DeckSlide[];
}

export type ThemePresetName = 'executive-navy' | 'mckinsey-light' | 'tech-dark' | 'academic-editorial' | 'healthcare-mint';

export interface ThemeTokens {
  name: ThemePresetName;
  coverBg: string;
  coverTitle: string;
  coverAccent: string;
  coverPillBg: string;
  coverPillBorder: string;
  coverPillText: string;
  contentBg: string;
  cardBg: string;
  cardBorder: string;
  accent: string;
  accentLight: string;
  accentText: string;
  titleColor: string;
  textColor: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  fontFamily: string;
}

export const THEME_PRESETS: Record<ThemePresetName, ThemeTokens> = {
  'executive-navy': {
    name: 'executive-navy',
    coverBg: '0B132B',
    coverTitle: 'FFFFFF',
    coverAccent: '38BDF8',
    coverPillBg: '1E293B',
    coverPillBorder: '38BDF8',
    coverPillText: '38BDF8',
    contentBg: 'F8FAFC',
    cardBg: 'FFFFFF',
    cardBorder: 'E2E8F0',
    accent: '2563EB',
    accentLight: 'EFF6FF',
    accentText: '1D4ED8',
    titleColor: '0F172A',
    textColor: '334155',
    tableHeaderBg: '1E293B',
    tableHeaderText: 'FFFFFF',
    fontFamily: 'Microsoft YaHei',
  },
  'mckinsey-light': {
    name: 'mckinsey-light',
    coverBg: '0A192F',
    coverTitle: 'FFFFFF',
    coverAccent: '0EA5E9',
    coverPillBg: '112240',
    coverPillBorder: '64FFDA',
    coverPillText: '64FFDA',
    contentBg: 'FFFFFF',
    cardBg: 'F8FAFC',
    cardBorder: 'E2E8F0',
    accent: '0A2540',
    accentLight: 'F0F4F8',
    accentText: '0A2540',
    titleColor: '0A2540',
    textColor: '425466',
    tableHeaderBg: '0A2540',
    tableHeaderText: 'FFFFFF',
    fontFamily: 'Segoe UI',
  },
  'tech-dark': {
    name: 'tech-dark',
    coverBg: '090D16',
    coverTitle: 'F1F5F9',
    coverAccent: '06B6D4',
    coverPillBg: '1E293B',
    coverPillBorder: '06B6D4',
    coverPillText: '06B6D4',
    contentBg: '0F172A',
    cardBg: '1E293B',
    cardBorder: '334155',
    accent: '06B6D4',
    accentLight: '164E63',
    accentText: '67E8F9',
    titleColor: 'F8FAFC',
    textColor: '94A3B8',
    tableHeaderBg: '0E7490',
    tableHeaderText: 'FFFFFF',
    fontFamily: 'Microsoft YaHei',
  },
  'academic-editorial': {
    name: 'academic-editorial',
    coverBg: '1F2937',
    coverTitle: 'F9FAFB',
    coverAccent: 'D97706',
    coverPillBg: '374151',
    coverPillBorder: 'FBBF24',
    coverPillText: 'FDE68A',
    contentBg: 'FAF9F6',
    cardBg: 'FFFFFF',
    cardBorder: 'E5E7EB',
    accent: 'B45309',
    accentLight: 'FEF3C7',
    accentText: '92400E',
    titleColor: '1F2937',
    textColor: '4B5563',
    tableHeaderBg: '374151',
    tableHeaderText: 'F9FAFB',
    fontFamily: 'SimSun',
  },
  'healthcare-mint': {
    name: 'healthcare-mint',
    coverBg: '064E3B',
    coverTitle: 'FFFFFF',
    coverAccent: '34D399',
    coverPillBg: '065F46',
    coverPillBorder: '34D399',
    coverPillText: 'A7F3D0',
    contentBg: 'F0FDF4',
    cardBg: 'FFFFFF',
    cardBorder: 'DCFCE7',
    accent: '059669',
    accentLight: 'ECFDF5',
    accentText: '047857',
    titleColor: '064E3B',
    textColor: '374151',
    tableHeaderBg: '065F46',
    tableHeaderText: 'FFFFFF',
    fontFamily: 'Microsoft YaHei',
  },
};

export interface RenderOptions {
  outPath: string;
  /** layout 解析器：slide → Map<blockId, Rect> */
  resolveRects: (slide: DeckSlide) => Map<string, Rect>;
  /** Template DNA 注入：用参考模板 accent/fontFamily 覆盖默认视觉（PHASE 13 P0） */
  dna?: { accent: string; fontFamily?: string };
  /** 商业主题预设：executive-navy | mckinsey-light | tech-dark | academic-editorial | healthcare-mint */
  themePreset?: ThemePresetName;
  /** 行业领域类型：business | academic | medical | engineering | education | government */
  domain?: DomainCategory;
  forceOverwrite?: boolean;
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

export function themeFor(kind: string, dna?: RenderOptions['dna'], presetName: ThemePresetName = 'executive-navy'): { fill: string; accent: string; font: string; fontFamily: string; preset: ThemeTokens } {
  const preset = THEME_PRESETS[presetName] ?? THEME_PRESETS['executive-navy'];
  const fill = kind === 'cover' || kind === 'ending' ? preset.coverBg : preset.contentBg;
  const font = kind === 'cover' || kind === 'ending' ? preset.coverTitle : preset.textColor;
  const accent = kind === 'cover' || kind === 'ending' ? preset.coverAccent : preset.accent;
  const fontFamily = preset.fontFamily;

  if (!dna) return { fill, accent, font, fontFamily, preset };
  return { fill, accent: dna.accent || accent, font, fontFamily: dna.fontFamily ?? fontFamily, preset };
}

function tOrPreset(fill: string, accent: string, font: string, fontFamily: string) {
  return { fill, accent, font, fontFamily };
}

export function resolveSlideScene(slide: DeckSlide, resolveRects: RenderOptions['resolveRects'], dna?: RenderOptions['dna'], themePreset?: ThemePresetName) {
  const rects = resolveRects(slide);
  return {
    theme: themeFor(slide.kind, dna, themePreset),
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

  const domain: DomainCategory = opts.domain || deck.domain || (deck.designTokens?.domain as DomainCategory) || detectDomain(deck);
  const domainMeta = DOMAIN_METAS[domain] ?? DOMAIN_METAS['business'];
  const themePreset: ThemePresetName = opts.themePreset ||
    (deck.designTokens?.preset as ThemePresetName) ||
    (deck.designTokens?.theme as ThemePresetName) ||
    domainMeta.defaultTheme;

  for (let idx = 0; idx < deck.slides.length; idx++) {
    const slide = deck.slides[idx];
    const scene = resolveSlideScene(slide, opts.resolveRects, opts.dna, themePreset);
    const theme = scene.theme;
    const s = p.addSlide();

    if (slide.kind === 'cover') {
      renderCoverSlide(s, slide, deck, theme, domain);
    } else {
      await renderContentSlide(s, slide, deck, theme, scene, idx, deck.slides.length, domain);
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
  theme: { fill: string; accent: string; font: string; fontFamily: string; preset: ThemeTokens },
  domain: DomainCategory = 'business'
) {
  const meta = DOMAIN_METAS[domain] ?? DOMAIN_METAS['business'];
  const p = theme.preset;

  // 1. 深邃高端极简暗色背景
  s.background = { color: p.coverBg };

  // 2. 顶部精致胶囊徽标
  const badgeText = `[ ${meta.name} · 成果发布 ]`;
  const badgeW = Math.max(3.6, badgeText.length * 0.24);
  s.addShape('roundRect', {
    x: 1.2,
    y: 1.5,
    w: badgeW,
    h: 0.4,
    fill: { color: p.coverPillBg },
    line: { color: p.coverPillBorder, width: 1.5 },
    rectRadius: 0.2,
  });
  s.addText(badgeText, {
    x: 1.2,
    y: 1.5,
    w: badgeW,
    h: 0.4,
    fontSize: 11,
    bold: true,
    color: p.coverPillText,
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
    color: p.coverTitle,
    fontFace: theme.fontFamily,
    valign: 'top',
  });

  // 4. 现代强调装饰条
  s.addShape('roundRect', {
    x: 1.2,
    y: 3.9,
    w: 2.8,
    h: 0.08,
    fill: { color: p.coverAccent },
    line: { color: p.coverAccent, width: 1 },
    rectRadius: 0.04,
  });

  // 5. 副标题 / 领域主旨宣言
  const subtitle = deck.subtitle || (slide.blocks[0]?.type === 'text' && slide.blocks[0].text ? slide.blocks[0].text : '') || meta.coverSubtitle;
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
  s.addText(`PresentationOS · ${deck.author ?? meta.name} · ${meta.coverMeta} · 100% 事实保真`, {
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

function classifySlideArchetype(slide: DeckSlide): 'table' | 'chart' | 'timeline' | 'comparison' | 'process' | 'quadrant' | 'funnel' | 'team' | 'quote' | 'cardGrid' | 'architecture' | 'pyramid' | 'flow' {
  if ((slide as any).archetype) {
    const valid = ['table', 'chart', 'timeline', 'comparison', 'process', 'quadrant', 'funnel', 'team', 'quote', 'cardGrid', 'architecture', 'pyramid', 'flow'];
    if (valid.includes((slide as any).archetype)) return (slide as any).archetype;
  }
  if (slide.kind && ['timeline', 'comparison', 'process', 'quadrant', 'funnel', 'team', 'quote', 'cardGrid', 'architecture', 'pyramid'].includes(slide.kind)) {
    return slide.kind as any;
  }

  const hasTable = slide.blocks.some((b) => b.type === 'table');
  const hasChart = slide.blocks.some((b) => b.type === 'chart');
  const hasOther = slide.blocks.some((b) => b.type !== 'text' && b.type !== 'table' && b.type !== 'chart');

  if (hasTable && !hasOther) return 'table';
  if (hasChart && !hasOther) return 'chart';

  const textBlocks = slide.blocks.filter((b) => b.type === 'text');
  if (textBlocks.length === 0 || hasOther) return 'flow';

  const title = slide.title;

  // 1. Quote archetype: single text block with style 'quote' or title containing '宣言' / '愿景' / '金句' or starts with '>'
  if (textBlocks.length === 1 && (slide.kind === 'quote' || textBlocks[0].style === 'quote' || /愿景|金句|宣言|使命|takeaway|quote/i.test(title) || (textBlocks[0].text && textBlocks[0].text.startsWith('>')))) {
    return 'quote';
  }

  // 2. Architecture / Tech Stack archetype: 3-4 blocks with architecture keywords
  if (textBlocks.length >= 3 && textBlocks.length <= 4) {
    const isArchTitle = /架构|分层|技术栈|体系|组件设计|系统蓝图|architecture|tech\s*stack|layered|layer/i.test(title);
    const hasArchKeywords = textBlocks.some(b => /层|终端|接入|网关|内核|基础|底座|tier|layer|gateway|kernel|storage|infra/i.test(b.text ?? ''));
    if (isArchTitle || hasArchKeywords) {
      return 'architecture';
    }
  }

  // 3. Pyramid / Strategic Hierarchy archetype: 3-4 blocks with pyramid keywords
  if (textBlocks.length >= 3 && textBlocks.length <= 4) {
    const isPyramidTitle = /金字塔|层级|顶层设计|战略定位|愿景支柱|pyramid|hierarchy|strategic\s*pillars/i.test(title);
    const hasPyramidKeywords = textBlocks.some(b => /顶层|使命|支柱|基石|底座|apex|pillar|foundation/i.test(b.text ?? ''));
    if (isPyramidTitle || hasPyramidKeywords) {
      return 'pyramid';
    }
  }

  // 4. Comparison archetype: 2 text blocks with contrasting words
  if (textBlocks.length === 2) {
    const isCompareTitle = /对比|差异|vs|优劣|传统.*(创新|新一代|现代化)|现状.*目标|before.*after/i.test(title);
    const hasContrastWords = textBlocks.some(b => /传统|现状|痛点|缺点|方案一|旧架构|原有|人工/i.test(b.text ?? '')) &&
                             textBlocks.some(b => /创新|突破|优势|方案二|新架构|成果|目标|智能|自动化/i.test(b.text ?? ''));
    if (isCompareTitle || hasContrastWords) {
      return 'comparison';
    }
  }

  // 5. 2x2 Matrix archetype: 4 blocks with quadrant / matrix / BCG / priority keywords
  if (textBlocks.length === 4) {
    const isMatrixTitle = /象限|矩阵|优先级|波士顿|matrix|quadrant|bcg|四维/i.test(title);
    const hasMatrixKeywords = textBlocks.some(b => /重要|紧急|高价值|低难度|快速见效|核心要务|战略重点|q[1-4]|第一象限/i.test(b.text ?? ''));
    if (isMatrixTitle || hasMatrixKeywords) {
      return 'quadrant';
    }
  }

  // 6. Funnel archetype: 3-5 blocks with funnel / conversion keywords
  const isFunnelTitle = /漏斗|转化|客户旅程|链路|funnel|pipeline|sales\s*funnel/i.test(title);
  const funnelPattern = /(曝光|浏览|展现|点击|激活|留存|付费|加购|线索|签约|复购|转化率)/i;
  const funnelMatches = textBlocks.filter(b => funnelPattern.test(b.text ?? '')).length;
  if ((isFunnelTitle && textBlocks.length >= 3 && textBlocks.length <= 5) || (funnelMatches >= 2 && textBlocks.length <= 5)) {
    return 'funnel';
  }

  // 7. Team / Profile archetype: 3-4 blocks with roles or titles
  const isTeamTitle = /团队|人员|领袖|专家|顾问|架构师|team|founders|leadership/i.test(title);
  const rolePattern = /(ceo|cto|coo|cfo|创始人|合伙人|专家|教授|总监|负责人|科学家|架构师)/i;
  const roleMatches = textBlocks.filter(b => rolePattern.test(b.text ?? '')).length;
  if ((isTeamTitle && textBlocks.length >= 2 && textBlocks.length <= 4) || (roleMatches >= 2 && textBlocks.length <= 4)) {
    return 'team';
  }

  // 8. Timeline archetype: dates / years / quarters / roadmap
  const isTimelineTitle = /时间|路线|规划|发展历程|里程碑|roadmap|timeline|阶段/i.test(title);
  const datePattern = /(20\d\d年?|q[1-4]|第[一二三四1-4]阶段|phase\s*\d|stage\s*\d|年度)/i;
  const dateMatches = textBlocks.filter(b => datePattern.test(b.text ?? '')).length;
  if ((isTimelineTitle && textBlocks.length >= 2 && textBlocks.length <= 5) || (dateMatches >= 2 && dateMatches === textBlocks.length)) {
    return 'timeline';
  }

  // 9. Process Flow archetype: steps / workflow
  const isProcessTitle = /流程|步骤|实施路径|闭环|架构推进|process|workflow|steps/i.test(title);
  const stepPattern = /^(第[一二三四1-4]步|步骤[一二三四1-4]|step\s*\d|[0-9][\.\、\s])/i;
  const stepMatches = textBlocks.filter(b => stepPattern.test(b.text?.trim() ?? '')).length;
  if ((isProcessTitle && textBlocks.length >= 2 && textBlocks.length <= 5) || (stepMatches >= 2 && stepMatches === textBlocks.length)) {
    return 'process';
  }

  // 10. Card Grid: 2 to 4 text blocks
  if (textBlocks.length >= 2 && textBlocks.length <= 4) {
    return 'cardGrid';
  }

  return 'flow';
}

function archetypeBadgeText(archetype: string, domain: DomainCategory = 'business'): string {
  const meta = DOMAIN_METAS[domain] ?? DOMAIN_METAS['business'];
  return meta.badgeMap[archetype] ?? meta.badgeMap['default'] ?? '[ 核心汇报 ]';
}

async function renderContentSlide(
  s: SlideLike,
  slide: DeckSlide,
  deck: DeckSpec,
  theme: { fill: string; accent: string; font: string; fontFamily: string; preset: ThemeTokens },
  scene: ReturnType<typeof resolveSlideScene>,
  slideIndex: number,
  totalSlides: number,
  domain: DomainCategory = 'business'
) {
  const meta = DOMAIN_METAS[domain] ?? DOMAIN_METAS['business'];
  const p = theme.preset;

  // 1. 内容背景色（自适应行业预设，科技黑为深黑，学术为象牙白，医疗为浅薄荷）
  s.background = { color: p.contentBg };

  const archetype = classifySlideArchetype(slide);
  const badgeLabel = archetypeBadgeText(archetype, domain);
  const badgeW = Math.max(2.4, badgeLabel.length * 0.22);

  // 2. 顶部微型分类标签（按语义与行业动态生成）
  s.addShape('roundRect', {
    x: 0.8,
    y: 0.42,
    w: badgeW,
    h: 0.32,
    fill: { color: p.accentLight },
    line: { color: p.accent, width: 1 },
    rectRadius: 0.15,
  });
  s.addText(badgeLabel, {
    x: 0.8,
    y: 0.42,
    w: badgeW,
    h: 0.32,
    fontSize: 10,
    bold: true,
    color: p.accentText,
    fontFace: theme.fontFamily,
    align: 'center',
    valign: 'middle',
  });

  // 3. 页面大标题（26pt 极简深色/浅色自适应）
  s.addText(slide.title, {
    x: 0.8,
    y: 0.78,
    w: 11.7,
    h: 0.65,
    fontSize: 26,
    bold: true,
    color: p.titleColor,
    fontFace: theme.fontFamily,
    valign: 'top',
  });

  // 4. 精致强调下划条
  s.addShape('roundRect', {
    x: 0.8,
    y: 1.48,
    w: 1.8,
    h: 0.05,
    fill: { color: p.accent },
    line: { color: p.accent, width: 1 },
    rectRadius: 0.02,
  });

  // 5. 底部页码与行业专属品牌标记
  s.addText(meta.footerTitle, {
    x: 0.8,
    y: 6.9,
    w: 6.5,
    h: 0.3,
    fontSize: 10,
    color: p.name === 'tech-dark' ? '64748B' : '94A3B8',
    fontFace: theme.fontFamily,
  });
  s.addText(`第 ${slideIndex + 1} 页 / 共 ${totalSlides} 页`, {
    x: 10.5,
    y: 6.9,
    w: 2.0,
    h: 0.3,
    fontSize: 10,
    color: p.name === 'tech-dark' ? '64748B' : '94A3B8',
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
    case 'quadrant': {
      renderQuadrantMatrix(s, textBlocks, theme);
      return;
    }
    case 'funnel': {
      renderFunnel(s, textBlocks, theme);
      return;
    }
    case 'team': {
      renderTeamGrid(s, textBlocks, theme);
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
    case 'architecture': {
      renderArchitectureStack(s, textBlocks, theme);
      return;
    }
    case 'pyramid': {
      renderPyramid(s, textBlocks, theme);
      return;
    }
    default: {
      await renderFlowCards(s, scene.blocks, theme);
      return;
    }
  }
}

function renderArchitectureStack(
  s: SlideLike,
  blocks: SlideBlock[],
  theme: { accent: string; font: string; fontFamily: string }
) {
  const count = Math.min(blocks.length, 4);
  const startY = 1.85;
  const totalH = 4.75;
  const gap = 0.14;
  const layerH = Math.round(((totalH - (count - 1) * gap) / count) * 100) / 100;
  const layerW = 11.73;
  const startX = 0.8;
  const tabW = 2.4;

  const layerThemes = [
    { bg: '1E3A8A', border: '3B82F6', label: 'L1 · 终端交互与接入层' },
    { bg: '0F172A', border: '64748B', label: 'L2 · 服务网关与编排层' },
    { bg: '2563EB', border: '60A5FA', label: 'L3 · 业务计算与内核层' },
    { bg: '0F766E', border: '14B8A6', label: 'L4 · 数据底座与基础设施' },
  ];

  for (let i = 0; i < count; i++) {
    const block = blocks[i];
    const y = startY + i * (layerH + gap);
    const lt = layerThemes[i % layerThemes.length];

    // 1. Layer Background Card
    s.addShape('roundRect', {
      x: startX,
      y,
      w: layerW,
      h: layerH,
      fill: { color: 'FFFFFF' },
      line: { color: 'CBD5E1', width: 1.2 },
      rectRadius: 0.08,
    });

    // 2. Left Indicator Tab
    s.addShape('roundRect', {
      x: startX,
      y,
      w: tabW,
      h: layerH,
      fill: { color: lt.bg },
      line: { color: lt.border, width: 1 },
      rectRadius: 0.08,
    });

    // Parse block content: split title and items
    const rawText = block.text?.trim() ?? '';
    const colonIdx = rawText.search(/[:：]/);
    const layerTitle = colonIdx > 0 ? rawText.slice(0, colonIdx).trim() : (count === 4 ? lt.label : `层级 0${i + 1}`);
    const details = colonIdx > 0 ? rawText.slice(colonIdx + 1).trim() : rawText;

    s.addText(layerTitle, {
      x: startX + 0.1,
      y: y + layerH / 2 - 0.28,
      w: tabW - 0.2,
      h: 0.56,
      fontSize: 12,
      bold: true,
      color: 'FFFFFF',
      fontFace: theme.fontFamily,
      align: 'center',
      valign: 'middle',
      wrap: true,
    });

    // 3. Right Component Chips Area
    const rightX = startX + tabW + 0.18;
    const rightW = layerW - tabW - 0.36;

    // Check if details contains bullet points or separators like '、', ',', ';', '|'
    const items = details.split(/[、,;|；]/).map(t => t.trim()).filter(Boolean);
    if (items.length >= 2 && items.length <= 4) {
      const chipGap = 0.15;
      const chipW = Math.round(((rightW - (items.length - 1) * chipGap) / items.length) * 100) / 100;
      const chipH = layerH - 0.2;
      const chipY = y + 0.1;

      for (let j = 0; j < items.length; j++) {
        s.addShape('roundRect', {
          x: rightX + j * (chipW + chipGap),
          y: chipY,
          w: chipW,
          h: chipH,
          fill: { color: 'F8FAFC' },
          line: { color: 'E2E8F0', width: 1 },
          rectRadius: 0.06,
        });
        s.addText(items[j], {
          x: rightX + j * (chipW + chipGap) + 0.08,
          y: chipY + 0.05,
          w: chipW - 0.16,
          h: chipH - 0.1,
          fontSize: 11,
          color: '1E293B',
          fontFace: theme.fontFamily,
          align: 'center',
          valign: 'middle',
          wrap: true,
        });
      }
    } else {
      s.addText(details, {
        x: rightX,
        y: y + 0.1,
        w: rightW,
        h: layerH - 0.2,
        fontSize: 12,
        color: '334155',
        fontFace: theme.fontFamily,
        valign: 'middle',
        wrap: true,
      });
    }
  }
}

function renderPyramid(
  s: SlideLike,
  blocks: SlideBlock[],
  theme: { accent: string; font: string; fontFamily: string }
) {
  const count = Math.min(blocks.length, 4);
  const startY = 1.9;
  const totalH = 4.65;
  const gap = 0.18;
  const tierH = Math.round(((totalH - (count - 1) * gap) / count) * 100) / 100;

  const tierWidths = count === 3 ? [6.2, 9.0, 11.73] : [5.2, 7.4, 9.6, 11.73];
  const tierBadges = count === 3
    ? ['[ APEX · 顶层愿景与战略使命 ]', '[ PILLARS · 核心支柱与差异化壁垒 ]', '[ FOUNDATION · 基石底座与工程赋能 ]']
    : ['[ APEX · 愿景使命 ]', '[ STRATEGY · 战略支柱 ]', '[ PLATFORM · 平台中枢 ]', '[ FOUNDATION · 底座基础设施 ]'];

  for (let i = 0; i < count; i++) {
    const block = blocks[i];
    const w = tierWidths[i];
    const x = 0.8 + (11.73 - w) / 2;
    const y = startY + i * (tierH + gap);

    const isApex = i === 0;
    const isBase = i === count - 1;

    // 1. Tier Card
    s.addShape('roundRect', {
      x,
      y,
      w,
      h: tierH,
      fill: { color: isApex ? '0B132B' : (isBase ? 'F8FAFC' : 'FFFFFF') },
      line: { color: isApex ? '38BDF8' : (isBase ? 'CBD5E1' : theme.accent || '2563EB'), width: 1.5 },
      rectRadius: 0.1,
    });

    // 2. Tier Badge
    s.addText(tierBadges[i], {
      x: x + 0.2,
      y: y + 0.1,
      w: w - 0.4,
      h: 0.28,
      fontSize: 10,
      bold: true,
      color: isApex ? '38BDF8' : (isBase ? '64748B' : '2563EB'),
      fontFace: theme.fontFamily,
      align: 'center',
      valign: 'middle',
    });

    // 3. Content
    s.addText(block.text ?? '', {
      x: x + 0.3,
      y: y + 0.4,
      w: w - 0.6,
      h: tierH - 0.5,
      fontSize: isApex ? 13 : 12,
      bold: isApex,
      color: isApex ? 'F8FAFC' : '334155',
      fontFace: theme.fontFamily,
      align: 'center',
      valign: 'middle',
      wrap: true,
    });
  }
}

function renderQuadrantMatrix(
  s: SlideLike,
  blocks: SlideBlock[],
  theme: { accent: string; font: string; fontFamily: string }
) {
  const cardW = 5.65;
  const cardH = 2.25;
  const topY = 1.85;
  const bottomY = 4.35;
  const leftX = 0.8;
  const rightX = 6.88;

  // Horizontal axis
  s.addShape('roundRect', {
    x: 0.6,
    y: 4.2,
    w: 12.13,
    h: 0.04,
    fill: { color: 'CBD5E1' },
    line: { color: 'CBD5E1', width: 1 },
    rectRadius: 0.02,
  });
  // Vertical axis
  s.addShape('roundRect', {
    x: 6.64,
    y: 1.75,
    w: 0.04,
    h: 4.95,
    fill: { color: 'CBD5E1' },
    line: { color: 'CBD5E1', width: 1 },
    rectRadius: 0.02,
  });

  const quadrants = [
    { x: leftX, y: topY, badge: 'Q2 · 快速见效', fill: 'FFFFFF', border: '10B981', bColor: '059669', block: blocks[0] },
    { x: rightX, y: topY, badge: 'Q1 · 战略重点', fill: 'EFF6FF', border: theme.accent || '2563EB', bColor: '1D4ED8', block: blocks[1] },
    { x: leftX, y: bottomY, badge: 'Q3 · 常规跟进', fill: 'F8FAFC', border: 'E2E8F0', bColor: '64748B', block: blocks[2] },
    { x: rightX, y: bottomY, badge: 'Q4 · 审慎评估', fill: 'FEF2F2', border: 'FCA5A5', bColor: 'DC2626', block: blocks[3] },
  ];

  for (const q of quadrants) {
    if (!q.block) continue;
    s.addShape('roundRect', {
      x: q.x,
      y: q.y,
      w: cardW,
      h: cardH,
      fill: { color: q.fill },
      line: { color: q.border, width: 1.5 },
      rectRadius: 0.1,
    });
    s.addShape('roundRect', {
      x: q.x + 0.25,
      y: q.y + 0.2,
      w: 1.8,
      h: 0.32,
      fill: { color: q.fill === 'FFFFFF' ? 'ECFDF5' : (q.fill === 'EFF6FF' ? 'DBEAFE' : 'F1F5F9') },
      line: { color: q.border, width: 1 },
      rectRadius: 0.08,
    });
    s.addText(q.badge, {
      x: q.x + 0.25,
      y: q.y + 0.2,
      w: 1.8,
      h: 0.32,
      fontSize: 10,
      bold: true,
      color: q.bColor,
      fontFace: theme.fontFamily,
      align: 'center',
      valign: 'middle',
    });
    s.addText(q.block.text ?? '', {
      x: q.x + 0.25,
      y: q.y + 0.65,
      w: cardW - 0.5,
      h: cardH - 0.8,
      fontSize: 13,
      color: '334155',
      fontFace: theme.fontFamily,
      valign: 'top',
      wrap: true,
    });
  }
}

function renderFunnel(
  s: SlideLike,
  blocks: SlideBlock[],
  theme: { accent: string; font: string; fontFamily: string }
) {
  const count = Math.min(blocks.length, 5);
  const startY = 1.9;
  const stageH = Math.min(1.0, 4.6 / count);
  const gap = 0.15;
  const colors = ['1E3A8A', '1D4ED8', '2563EB', '0284C7', '0D9488'];

  for (let i = 0; i < count; i++) {
    const block = blocks[i];
    const stageW = 11.73 - i * (5.0 / count);
    const stageX = 0.8 + (11.73 - stageW) / 2;
    const y = startY + i * (stageH + gap);

    s.addShape('roundRect', {
      x: stageX,
      y,
      w: stageW,
      h: stageH,
      fill: { color: colors[i % colors.length] },
      line: { color: 'FFFFFF', width: 1.5 },
      rectRadius: 0.08,
    });

    s.addShape('roundRect', {
      x: stageX + 0.3,
      y: y + stageH / 2 - 0.18,
      w: 1.3,
      h: 0.36,
      fill: { color: '0B132B' },
      line: { color: '38BDF8', width: 1 },
      rectRadius: 0.08,
    });
    s.addText(`STAGE 0${i + 1}`, {
      x: stageX + 0.3,
      y: y + stageH / 2 - 0.18,
      w: 1.3,
      h: 0.36,
      fontSize: 10,
      bold: true,
      color: '38BDF8',
      fontFace: theme.fontFamily,
      align: 'center',
      valign: 'middle',
    });

    s.addText(block.text ?? '', {
      x: stageX + 1.8,
      y: y + 0.1,
      w: stageW - 2.1,
      h: stageH - 0.2,
      fontSize: 13,
      bold: true,
      color: 'FFFFFF',
      fontFace: theme.fontFamily,
      valign: 'middle',
      wrap: true,
    });
  }
}

function renderTeamGrid(
  s: SlideLike,
  blocks: SlideBlock[],
  theme: { accent: string; font: string; fontFamily: string }
) {
  const count = blocks.length;
  const startX = 0.8;
  const totalW = 11.73;
  const gap = count === 4 ? 0.25 : (count === 3 ? 0.38 : 0.5);
  const cardW = Math.round(((totalW - (count - 1) * gap) / count) * 100) / 100;
  const cardY = 1.9;
  const cardH = 4.6;

  for (let i = 0; i < count; i++) {
    const block = blocks[i];
    const x = startX + i * (cardW + gap);

    s.addShape('roundRect', {
      x,
      y: cardY,
      w: cardW,
      h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: 'E2E8F0', width: 1.5 },
      rectRadius: 0.12,
    });
    s.addShape('roundRect', {
      x: x + 0.1,
      y: cardY + 0.08,
      w: cardW - 0.2,
      h: 0.05,
      fill: { color: theme.accent || '2563EB' },
      line: { color: theme.accent || '2563EB', width: 1 },
      rectRadius: 0.02,
    });

    const avatarR = 0.9;
    const avatarX = x + cardW / 2 - avatarR / 2;
    const avatarY = cardY + 0.35;
    s.addShape('roundRect', {
      x: avatarX,
      y: avatarY,
      w: avatarR,
      h: avatarR,
      fill: { color: 'EFF6FF' },
      line: { color: theme.accent || '2563EB', width: 2 },
      rectRadius: avatarR / 2,
    });
    s.addText('👤', {
      x: avatarX,
      y: avatarY,
      w: avatarR,
      h: avatarR,
      fontSize: 22,
      align: 'center',
      valign: 'middle',
    });

    const raw = block.text ?? '';
    const match = /^([^·:：\s]+)\s*(?:[·-]\s*([^:：\n]+))?[:：\s]*([\s\S]*)$/.exec(raw);
    const name = match ? match[1] : `成员 0${i + 1}`;
    const role = match && match[2] ? match[2].trim() : '核心业务领袖';
    const bio = match && match[3] ? match[3].trim() : raw;

    s.addText(name, {
      x: x + 0.2,
      y: cardY + 1.4,
      w: cardW - 0.4,
      h: 0.38,
      fontSize: 16,
      bold: true,
      color: '0F172A',
      fontFace: theme.fontFamily,
      align: 'center',
    });

    s.addShape('roundRect', {
      x: x + cardW / 2 - 1.1,
      y: cardY + 1.85,
      w: 2.2,
      h: 0.32,
      fill: { color: 'F1F5F9' },
      line: { color: 'CBD5E1', width: 1 },
      rectRadius: 0.08,
    });
    s.addText(role, {
      x: x + cardW / 2 - 1.1,
      y: cardY + 1.85,
      w: 2.2,
      h: 0.32,
      fontSize: 11,
      bold: true,
      color: '1D4ED8',
      fontFace: theme.fontFamily,
      align: 'center',
      valign: 'middle',
    });

    s.addText(bio, {
      x: x + 0.3,
      y: cardY + 2.3,
      w: cardW - 0.6,
      h: cardH - 2.5,
      fontSize: 12,
      color: '475569',
      fontFace: theme.fontFamily,
      valign: 'top',
      wrap: true,
    });
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
