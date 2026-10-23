// PPTX Renderer（总方案 PHASE 7 / P06）：DeckSpec + 几何 → PptxGenJS → 高保真现代企业级可编辑 PPTX
import * as pptxgenNS from 'pptxgenjs';
import type { Rect, LayoutIR } from './layout-engine.js';
import { copyFile, unlink, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { verifyRenderedDeck, type RenderedDeckVerification } from './readback.js';
import { randomUUID } from 'node:crypto';
import { metricLiteral } from './metric.js';
import JSZip from 'jszip';
import { readDesignTokens, onColor, type DesignTokens } from './design-tokens.js';

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
  archetype?: SlideArchetype;
}

export type DomainCategory =
  | 'business'
  | 'academic'
  | 'medical'
  | 'engineering'
  | 'education'
  | 'government'
  | 'finance'
  | 'consulting'
  | 'legal'
  | 'creative';

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
    footerTitle: 'PresentationOS',
    coverSubtitle: '',
    coverMeta: '',
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
    footerTitle: 'PresentationOS',
    coverSubtitle: '',
    coverMeta: '',
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
    footerTitle: 'PresentationOS',
    coverSubtitle: '',
    coverMeta: '',
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
    footerTitle: 'PresentationOS',
    coverSubtitle: '',
    coverMeta: '',
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
    footerTitle: 'PresentationOS',
    coverSubtitle: '',
    coverMeta: '',
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
    footerTitle: 'PresentationOS',
    coverSubtitle: '',
    coverMeta: '',
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
  finance: {
    domain: 'finance',
    name: '金融投资与投行研报',
    defaultTheme: 'financial-gold',
    footerTitle: 'PresentationOS',
    coverSubtitle: '',
    coverMeta: '',
    badgeMap: {
      pyramid: '[ 资本结构 · 股权债券多层架构 ]',
      architecture: '[ 交易架构 · 境内外红筹上市拓扑 ]',
      comparison: '[ 对标估值 · P/E vs EV/EBITDA 横评 ]',
      quadrant: '[ 风险收益 · 资产组合分配象限 ]',
      funnel: '[ 交易漏斗 · 并购标的筛选漏斗 ]',
      team: '[ 承销团队 · 保荐代表人与量化团队 ]',
      timeline: '[ IPO 进程 · 申报过会发行时间轴 ]',
      process: '[ 尽调流程 · 财务法律审计六步法 ]',
      cardGrid: '[ 核心财务指标 · 营收/净利/EBITDA ]',
      table: '[ 财务预测 · 三张表未来五年预测 ]',
      quote: '[ 投资论点 · 核心投资价值陈述 ]',
      default: '[ 金融研报 · 关键财务结论 ]',
    },
  },
  consulting: {
    domain: 'consulting',
    name: '管理咨询与战略规划',
    defaultTheme: 'mckinsey-light',
    footerTitle: 'PresentationOS',
    coverSubtitle: '',
    coverMeta: '',
    badgeMap: {
      pyramid: '[ 议题树 · MECE 战略分解金字塔 ]',
      architecture: '[ 转型蓝图 · 业务与技术顶层架构 ]',
      comparison: '[ 战略选型 · 自研 vs 并购 vs 合作 ]',
      quadrant: '[ 优先级矩阵 · 业务影响 vs 实施难度 ]',
      funnel: '[ 变革漏斗 · 组织阻力与认知转化 ]',
      team: '[ 咨询顾问 · 项目合伙人与专家组 ]',
      timeline: '[ 落地路线图 · 3 年数字化转型路径 ]',
      process: '[ 实施路径 · 阶段规划与交付物闭环 ]',
      cardGrid: '[ 价值量化 · 降本增效 ROI 测算 ]',
      table: '[ 差距分析 · 现状 vs 行业标杆 ]',
      quote: '[ 核心洞见 · 董事长战略解码寄语 ]',
      default: '[ 战略洞见 · 关键决策建议 ]',
    },
  },
  legal: {
    domain: 'legal',
    name: '法律事务与合规风控',
    defaultTheme: 'legal-burgundy',
    footerTitle: 'PresentationOS',
    coverSubtitle: '',
    coverMeta: '',
    badgeMap: {
      pyramid: '[ 法律渊源 · 宪制法律规章层级 ]',
      architecture: '[ 证据链网 · 主客观证据印证拓扑 ]',
      comparison: '[ 判例对比 · 指导性案例与本案异同 ]',
      quadrant: '[ 法律风险 · 违规概率 vs 罚金影响象限 ]',
      funnel: '[ 诉讼程序 · 举证质证判决漏斗 ]',
      team: '[ 出庭律师 · 主办合伙人与法律顾问 ]',
      timeline: '[ 案情脉络 · 争议发生与仲裁推进时序 ]',
      process: '[ 合规整改 · 闭环审查四步法 ]',
      cardGrid: '[ 索赔标的 · 涉案金额与预期损益 ]',
      table: '[ 证据清单 · 证据名称/证明目的/质证意见 ]',
      quote: '[ 法律意见 · 资深大律师法律结论 ]',
      default: '[ 法律意见 · 核心法理要旨 ]',
    },
  },
  creative: {
    domain: 'creative',
    name: '创意设计与品牌公关',
    defaultTheme: 'creative-gradient',
    footerTitle: 'PresentationOS',
    coverSubtitle: '',
    coverMeta: '',
    badgeMap: {
      pyramid: '[ 品牌金字塔 · 使命愿景与核心价值 ]',
      architecture: '[ 传播矩阵 · 全域多触点营销拓扑 ]',
      comparison: '[ 竞品突围 · 差异化品牌定位 VS 对比 ]',
      quadrant: '[ 人群定位 · Z世代偏好与消费力象限 ]',
      funnel: '[ 营销漏斗 · 曝光获客与私域沉淀漏斗 ]',
      team: '[ 主创团队 · 创意总监与艺术指导 ]',
      timeline: '[ 发售波次 · 预热引爆与长尾节奏 ]',
      process: '[ 策展动线 · 空间感官体验六阶段 ]',
      cardGrid: '[ 传播声量 · 全网曝光与 GMV 爆发预期 ]',
      table: '[ 媒体矩阵 · 投放渠道/预算配比/ROI 横评 ]',
      quote: '[ 品牌宣言 · 态度主张与情绪共鸣 ]',
      default: '[ 创意概念 · 核心灵感提案 ]',
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
  const financeScore = (fullText.match(/投行|证券|估值|股权|债券|融资|财报|净利润|ebitda|ipo|承销|量化|投资组合|收益率|资本市场|基金|纳斯达克|上市|尽调|现金流|资产负债/gi) || []).length;
  const consultingScore = (fullText.match(/咨询|麦肯锡|数字化转型|mece|组织变革|议题树|商业模式|战略规划|标杆对标|顶层设计|降本增效|痛点诊断|战略解码|变革管理/gi) || []).length;
  const legalScore = (fullText.match(/法律|诉讼|仲裁|证据|法院|侵权|知识产权|专利|合规|gdpr|pipl|律师|案情|判决|法规|条例|违约|赔偿/gi) || []).length;
  const creativeScore = (fullText.match(/创意|品牌|视觉|策展|艺术|传媒|影视|宣发|潮玩|营销|设计|美学|故事板|概念|时尚|先锋/gi) || []).length;

  const max = Math.max(academicScore, medicalScore, techScore, eduScore, govScore, financeScore, consultingScore, legalScore, creativeScore);
  if (max === 0) return 'business';

  if (financeScore === max) return 'finance';
  if (consultingScore === max) return 'consulting';
  if (legalScore === max) return 'legal';
  if (creativeScore === max) return 'creative';
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

export type ThemePresetName =
  | 'executive-navy'
  | 'mckinsey-light'
  | 'tech-dark'
  | 'academic-editorial'
  | 'healthcare-mint'
  | 'financial-gold'
  | 'legal-burgundy'
  | 'creative-gradient';

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
  'financial-gold': {
    name: 'financial-gold',
    coverBg: '0B1528',
    coverTitle: 'FFFFFF',
    coverAccent: 'F59E0B',
    coverPillBg: '1E293B',
    coverPillBorder: 'F59E0B',
    coverPillText: 'FDE68A',
    contentBg: 'F8FAFC',
    cardBg: 'FFFFFF',
    cardBorder: 'E2E8F0',
    accent: 'B45309',
    accentLight: 'FEF3C7',
    accentText: '92400E',
    titleColor: '0F172A',
    textColor: '334155',
    tableHeaderBg: '1E293B',
    tableHeaderText: 'F59E0B',
    fontFamily: 'Segoe UI',
  },
  'legal-burgundy': {
    name: 'legal-burgundy',
    coverBg: '1C1417',
    coverTitle: 'FFFFFF',
    coverAccent: 'E11D48',
    coverPillBg: '2E1922',
    coverPillBorder: 'E11D48',
    coverPillText: 'FDA4AF',
    contentBg: 'FAFAF9',
    cardBg: 'FFFFFF',
    cardBorder: 'E7E5E4',
    accent: '9F1239',
    accentLight: 'FFE4E6',
    accentText: '881337',
    titleColor: '1C1917',
    textColor: '44403C',
    tableHeaderBg: '4C0519',
    tableHeaderText: 'FFFFFF',
    fontFamily: 'SimSun',
  },
  'creative-gradient': {
    name: 'creative-gradient',
    coverBg: '0F0B1E',
    coverTitle: 'FFFFFF',
    coverAccent: 'A855F7',
    coverPillBg: '211638',
    coverPillBorder: 'C084FC',
    coverPillText: 'E9D5FF',
    contentBg: 'FAF5FF',
    cardBg: 'FFFFFF',
    cardBorder: 'E9D5FF',
    accent: '7E22CE',
    accentLight: 'F3E8FF',
    accentText: '6B21A8',
    titleColor: '2E1065',
    textColor: '475569',
    tableHeaderBg: '3B0764',
    tableHeaderText: 'FFFFFF',
    fontFamily: 'Microsoft YaHei',
  },
};

export type SlideArchetype = 'cover' | 'table' | 'chart' | 'timeline' | 'comparison' | 'process' | 'quadrant' | 'funnel' | 'team' | 'quote' | 'cardGrid' | 'architecture' | 'pyramid' | 'flow';

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
  /** Cooperative task cancellation, checked between CPU render batches and before publishing. */
  signal?: AbortSignal;
}


export interface ResolvedCommand {
  id: string;
  type: 'text' | 'shape' | 'table' | 'chart' | 'image';
  role: 'content' | 'decoration';
  sourceBlockIndex?: number;
  rect: Rect;
  options: Record<string, unknown>;
  text?: string;
  shape?: string;
  rows?: unknown[][];
  chartType?: string;
  data?: unknown[];
}

export interface SourceBlockMapping {
  blockIndex: number;
  type: string;
  commandIds: string[];
}

export interface ResolvedSlideScene {
  slideId: string;
  index: number;
  kind: string;
  archetype: SlideArchetype;
  background: { color: string };
  theme: ReturnType<typeof themeFor>;
  title: { rect: Rect; fontSize: number };
  commands: ResolvedCommand[];
  sources: SourceBlockMapping[];
  /** Actual source object geometry, retained for existing callers. */
  blocks: Array<{id: string; block: SlideBlock; rect: Rect; fontSize: number}>;
}

export function themeFor(kind: string, dna?: RenderOptions['dna'], presetName: ThemePresetName = 'executive-navy', tokens?: DesignTokens) {
  const base = THEME_PRESETS[presetName] ?? THEME_PRESETS['executive-navy'];
  const color = (role: keyof DesignTokens['colors'], fallback: string) => typeof tokens?.colors[role] === 'string' ? (tokens.colors[role] as string).slice(1).toUpperCase() : fallback;
  const primary = color('primary', base.accent), background = color('background', base.contentBg), foreground = color('text', base.textColor);
  const accent = color('accent', primary), surface = color('surface', background);
  const preset = tokens ? { ...base, coverBg: primary, coverTitle: onColor(primary), coverAccent: onColor(primary),
    contentBg: background, cardBg: surface, cardBorder: color('secondary', base.cardBorder), accent, accentLight: surface,
    accentText: onColor(accent), titleColor: foreground, textColor: foreground, tableHeaderBg: primary,
    tableHeaderText: onColor(primary), fontFamily: tokens.fonts.body } : base;
  const cover = kind === 'cover' || kind === 'ending';
  return {
    fill: cover ? preset.coverBg : preset.contentBg,
    accent: tokens ? (cover ? preset.coverAccent : preset.accent) : dna?.accent || (cover ? preset.coverAccent : preset.accent),
    font: cover ? preset.coverTitle : preset.textColor,
    fontFamily: tokens?.fonts.body ?? dna?.fontFamily ?? preset.fontFamily,
    headingFont: tokens?.fonts.heading ?? dna?.fontFamily ?? preset.fontFamily,
    chartColors: tokens ? [...new Set([primary, color('secondary', base.accent), accent, ...[1,2,3,4,5,6].map(n => color(`series${n}`, '')), '10B981', 'F59E0B', '8B5CF6', 'EF4444'].filter(Boolean))] : [dna?.accent || preset.accent, 'F59E0B', '10B981', 'EF4444'],
    preset,
  };
}

const ARCHETYPES: SlideArchetype[] = ['cover','table','chart','timeline','comparison','process','quadrant','funnel','team','quote','cardGrid','architecture','pyramid','flow'];
const CAPACITY: Partial<Record<SlideArchetype, {min: number; max: number}>> = {
  comparison: {min:2,max:2}, quadrant:{min:4,max:4}, pyramid:{min:3,max:4},
  architecture:{min:1,max:4}, funnel:{min:2,max:5}, team:{min:1,max:4},
  timeline:{min:1,max:5}, process:{min:1,max:5}, cardGrid:{min:1,max:4},quote:{min:1,max:1},
};

function classifySlideArchetype(slide: DeckSlide): SlideArchetype {
  if (slide.kind === 'cover') return 'cover';
  const explicit = slide.archetype ?? (ARCHETYPES.includes(slide.kind as SlideArchetype) ? slide.kind as SlideArchetype : undefined);
  if (slide.archetype && !ARCHETYPES.includes(slide.archetype)) throw new Error(`Unsupported archetype: ${slide.archetype}`);
  const textOnly = slide.blocks.every(b => b.type === 'text');
  if (explicit && !['flow','table','chart'].includes(explicit)) {
    if (!textOnly) throw new Error(`${explicit} requires text blocks; use flow for mixed content`);
    const cap = CAPACITY[explicit];
    if (cap && (slide.blocks.length < cap.min || slide.blocks.length > cap.max)) {
      throw new Error(`${explicit} accepts ${cap.min}-${cap.max} blocks; got ${slide.blocks.length}; split the slide or use flow`);
    }
    return explicit;
  }
  // Mixed slides render every block. Presence of a table must never hide its neighbours.
  if (!textOnly) return slide.blocks.length === 1 && slide.blocks[0].type === 'table' ? 'table' : 'flow';
  const n = slide.blocks.length, title = slide.title;
  if (n === 1 && (slide.blocks[0].style === 'quote' || /愿景|金句|宣言|quote|takeaway/i.test(title))) return 'quote';
  if (n >= 3 && n <= 4 && /金字塔|层级|战略定位|pyramid|hierarchy/i.test(title)) return 'pyramid';
  if (n >= 3 && n <= 4 && /架构|分层|技术栈|体系|architecture|tech\s*stack/i.test(title)) return 'architecture';
  if (n === 2 && /对比|差异|vs|before.*after/i.test(title)) return 'comparison';
  if (n === 4 && /象限|矩阵|优先级|matrix|quadrant/i.test(title)) return 'quadrant';
  if (n >= 2 && n <= 5 && /漏斗|转化|funnel|pipeline/i.test(title)) return 'funnel';
  if (n >= 2 && n <= 4 && /团队|人员|专家|team|founders|leadership/i.test(title)) return 'team';
  if (n >= 2 && n <= 5 && /时间|路线|里程碑|roadmap|timeline/i.test(title)) return 'timeline';
  if (n >= 2 && n <= 5 && /流程|步骤|实施路径|process|workflow/i.test(title)) return 'process';
  if (n >= 2 && n <= 4) return 'cardGrid';
  return 'flow';
}

function gridRects(count: number, area: Rect, columns: number): Rect[] {
  if (!count) return [];
  const rows = Math.ceil(count / columns), gap = 0.18;
  const w = (area.w - gap * (columns - 1)) / columns;
  const h = (area.h - gap * (rows - 1)) / rows;
  if (w < 0.5 || h < 0.35) throw new Error('Slide has too many blocks for a readable layout; split the content');
  return Array.from({length:count},(_,i)=>({x:area.x+(i%columns)*(w+gap),y:area.y+Math.floor(i/columns)*(h+gap),w,h}));
}

function assertText(text: string, label: string): void {
  if (/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(text)) throw new Error(`${label} contains an XML 1.0 forbidden character`);
}

/** One final command stream is the source for drawing, QA geometry and content mapping. */
export function resolveDeckScenes(deck: DeckSpec, opts: Pick<RenderOptions,'resolveRects'|'dna'|'themePreset'|'domain'>): ResolvedSlideScene[] {
  if (!deck.slides.length) throw new Error('Deck must contain at least one slide');
  const ids = deck.slides.map(slide => slide.id);
  if (ids.some(id => !id.trim()) || new Set(ids).size !== ids.length) throw new Error('Slide IDs must be non-empty and unique');
  const preset=resolvePreset(deck,opts);
  return deck.slides.map((slide,index)=>composeSlide(deck,slide,index,opts,preset));
}

function resolvePreset(deck:DeckSpec,opts:Pick<RenderOptions,'domain'|'themePreset'>):ThemePresetName {
  const domain=opts.domain??detectDomain(deck),meta=DOMAIN_METAS[domain]??DOMAIN_METAS.business;
  const preset = opts.themePreset??deck.designTokens?.preset as ThemePresetName??deck.designTokens?.theme as ThemePresetName??meta.defaultTheme;
  if (!Object.hasOwn(THEME_PRESETS,preset)) throw new Error(`Unsupported theme preset: ${preset}`);
  return preset;
}

function checkCancelled(signal?:AbortSignal):void {
  if(signal?.aborted)throw new Error('Rendering was cancelled; no output published');
}

async function renderCheckpoint(signal?:AbortSignal):Promise<void> {
  await new Promise<void>(done=>setImmediate(done));
  checkCancelled(signal);
}

export function resolveSlideScene(slide: DeckSlide, resolveRects: RenderOptions['resolveRects'], dna?: RenderOptions['dna'], themePreset?: ThemePresetName): ResolvedSlideScene {
  return resolveDeckScenes({title:slide.title,slides:[slide]}, {resolveRects,dna,themePreset})[0];
}

function composeSlide(deck: DeckSpec, slide: DeckSlide, index: number, opts: Pick<RenderOptions,'resolveRects'|'dna'|'domain'>, preset: ThemePresetName): ResolvedSlideScene {
  assertText(slide.title,'Slide title');
  if (slide.notes) assertText(slide.notes,'Slide notes');
  if (slide.kind === 'cover' && deck.subtitle) assertText(deck.subtitle,'Deck subtitle');
  const archetype = classifySlideArchetype(slide);
  const theme = themeFor(slide.kind,opts.dna,preset,readDesignTokens(deck.designTokens)), p = theme.preset;
  const cover = archetype === 'cover';
  const commands: ResolvedCommand[] = [];
  const sourceRects = opts.resolveRects(slide);
  let serial = 0;
  const add = (type: ResolvedCommand['type'], rect: Rect, options: Record<string,unknown>, extra: Partial<ResolvedCommand> = {}, sourceBlockIndex?: number, role: ResolvedCommand['role']='decoration') => {
    if (![rect.x,rect.y,rect.w,rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) throw new Error(`Invalid final rectangle for slide ${slide.id}`);
    const id = `${slide.id}-command-${serial++}`;
    commands.push({id,type,role,rect:{...rect},options:{...rect,objectName:id,...options},sourceBlockIndex,...extra});
  };
  const decoration = (rect: Rect, fill: string, border = p.cardBorder) => add('shape',rect,{fill:{color:fill},line:{color:border,width:1},radius:0.08},{shape:'roundRect'});
  const text = (value: string, rect: Rect, options: Record<string,unknown>, sourceBlockIndex?: number, objectName?: string, role: ResolvedCommand['role']='content') => {
    assertText(value,'Text');
    add('text',rect,{fontFace:theme.fontFamily,fontSize:16,color:theme.font,margin:0,breakLine:false,valign:'top',wrap:true,fit:'shrink',...options,...(objectName?{objectName}:{})},{text:value},sourceBlockIndex,role);
  };
  const titleRect = cover ? {x:1.0,y:1.1,w:11.33,h:1.45} : {x:0.8,y:0.65,w:11.73,h:0.8};
  text(slide.title,titleRect,{fontSize:cover?34:26,bold:true,color:cover?p.coverTitle:p.titleColor,fontFace:theme.headingFont},undefined,`source-${slide.id}-title`);
  decoration({x:cover?1.0:0.8,y:cover?2.78:1.5,w:1.8,h:0.05},theme.accent,theme.accent);
  if (!cover) text(`${index+1} / ${deck.slides.length}`,{x:11.0,y:7.0,w:1.5,h:0.2},{fontSize:9,align:'right',color:p.textColor},undefined,undefined,'decoration');
  if (deck.author) text(deck.author,{x:cover?1.0:0.8,y:7.0,w:9.5,h:0.2},{fontSize:9,color:cover?p.coverTitle:p.textColor},undefined,undefined,'decoration');
  let area: Rect = cover ? {x:1.0,y:3.2,w:11.33,h:3.3} : {x:0.8,y:1.85,w:11.73,h:4.8};
  if (cover && deck.subtitle) {
    text(deck.subtitle,{x:1.0,y:3.05,w:11.33,h:0.65},{fontSize:18,color:p.coverTitle},undefined,`source-${slide.id}-subtitle`);
    area = {x:1.0,y:3.95,w:11.33,h:2.65};
  }
  const count = slide.blocks.length;
  let rects = gridRects(count,area,archetype==='cover'?1:Math.min(3,Math.max(1,count)));
  const vertical = ['architecture','pyramid','funnel'].includes(archetype);
  if (vertical) rects = gridRects(count,area,1);
  if (['comparison','cardGrid','team','timeline','process'].includes(archetype)) rects = gridRects(count,area,Math.max(1,count));
  if (archetype==='quote' || archetype==='table') rects = [area];
  if (archetype==='quadrant') {
    const slots = gridRects(4,area,2), used = new Set<number>();
    rects = slide.blocks.map((b,i)=>{
      const parsed = /(?:^|\s)Q([1-4])\b/i.exec(b.text??'');
      const q = parsed ? Number(parsed[1]) : i+1;
      if (used.has(q)) throw new Error('Duplicate quadrant identifier; provide one block for each Q1-Q4');
      used.add(q);
      return slots[({1:1,2:0,3:2,4:3} as Record<number,number>)[q]];
    });
  }
  if (archetype==='comparison') add('shape',{x:6.655,y:area.y,w:0.02,h:area.h},{line:{color:p.cardBorder,width:1}},{shape:'line'});
  if (archetype==='timeline' && count>1) {
    const first=rects[0],last=rects[count-1];
    add('shape',{x:first.x+first.w/2,y:area.y+0.4,w:last.x+last.w/2-first.x-first.w/2,h:0.01},{line:{color:theme.accent,width:2}},{shape:'line'});
  }
  const mapping: SourceBlockMapping[] = [];
  const blocks: ResolvedSlideScene['blocks'] = [];
  for (let i=0;i<count;i++) {
    const block=slide.blocks[i], name=`source-${slide.id}-block-${i}`;
    let rect=rects[i];
    if (archetype==='flow' && sourceRects.has(`block-${i}`)) rect=sourceRects.get(`block-${i}`)!;
    if (archetype==='pyramid' || archetype==='funnel') {
      const ratio=archetype==='pyramid'?0.55+0.45*i/Math.max(1,count-1):1-0.36*i/Math.max(1,count-1);
      rect={...rect,x:rect.x+rect.w*(1-ratio)/2,w:rect.w*ratio};
    }
    const first=commands.length;
    const baseFont=fontSizeFor(block.style)*(block.fontScale??1);
    if (!Number.isFinite(baseFont) || baseFont<=0) throw new Error('Text font scale must be positive and finite');
    const contentColor=block.color??(cover?p.coverTitle:p.textColor);
    switch(block.type) {
      case 'text': {
        if (block.text===undefined || !block.text.trim()) throw new Error('Text block must not be empty');
        let body={...rect};
        if (!cover) {
          if (archetype==='pyramid' || archetype==='funnel') {
            add('shape',rect,{fill:{color:i%2?p.accentLight:p.cardBg},line:{color:theme.accent,width:1},...(archetype==='funnel'?{flipV:true}:{})},{shape:'trapezoid'});
            body={x:rect.x+rect.w*0.2,y:rect.y+0.15,w:rect.w*0.6,h:rect.h-0.3};
          } else if (archetype==='architecture') {
            decoration(rect,i%2?p.accentLight:p.cardBg,theme.accent);
            add('shape',{x:rect.x,y:rect.y,w:0.1,h:rect.h},{fill:{color:theme.accent},line:{color:theme.accent}},{shape:'rect'});
            body={x:rect.x+0.3,y:rect.y+0.15,w:rect.w-0.6,h:rect.h-0.3};
          } else if (archetype==='timeline') {
            add('shape',{x:rect.x+rect.w/2-0.14,y:area.y+0.26,w:0.28,h:0.28},{fill:{color:theme.accent},line:{color:theme.accent}},{shape:'ellipse'});
            body={x:rect.x+0.12,y:rect.y+0.95,w:rect.w-0.24,h:rect.h-1.05};
          } else if (archetype==='process') {
            add('shape',{x:rect.x,y:rect.y,w:rect.w,h:0.55},{fill:{color:theme.accent},line:{color:theme.accent}},{shape:'chevron'});
            body={x:rect.x+0.12,y:rect.y+0.85,w:rect.w-0.24,h:rect.h-0.95};
          } else if (archetype==='team') {
            add('shape',{x:rect.x+rect.w/2-0.5,y:rect.y+0.25,w:1,h:1},{fill:{color:p.accentLight},line:{color:theme.accent,width:2}},{shape:'ellipse'});
            body={x:rect.x+0.12,y:rect.y+1.6,w:rect.w-0.24,h:rect.h-1.75};
          } else if (archetype==='quote') {
            add('shape',{x:rect.x+1,y:rect.y+0.35,w:rect.w-2,h:0.02},{line:{color:theme.accent,width:2}},{shape:'line'});
            add('shape',{x:rect.x+1,y:rect.y+rect.h-0.37,w:rect.w-2,h:0.02},{line:{color:theme.accent,width:2}},{shape:'line'});
            body={x:rect.x+0.55,y:rect.y+0.75,w:rect.w-1.1,h:rect.h-1.5};
          } else {
            decoration(rect,archetype==='comparison' && i===1?p.accentLight:p.cardBg);
            body={x:rect.x+0.18,y:rect.y+0.18,w:rect.w-0.36,h:rect.h-0.36};
          }
        }
        const metric=archetype==='cardGrid'?metricLiteral(block.text):null;
        if (metric && body.h>=1.8) {
          text(metric,{...body,h:0.65},{fontSize:28,bold:true,color:theme.accent},i,`derived-${slide.id}-metric-${i}`);
          body={...body,y:body.y+0.85,h:body.h-0.85};
        }
        if (archetype==='quadrant') {
          const parsed=/(?:^|\s)Q([1-4])\b/i.exec(block.text);
          const badge=parsed?`Q${parsed[1]}`:`Q${i+1}`;
          text(badge,{x:body.x,y:body.y,w:1.0,h:0.28},{fontSize:10,bold:true,color:theme.accent},undefined,undefined,'decoration');
          body={...body,y:body.y+0.4,h:body.h-0.4};
        }
        text(block.text,body,{fontSize:archetype==='quote'?24:baseFont,color:contentColor,...(/^h[1-3]$/.test(block.style??'')?{fontFace:theme.headingFont}:{}),...(archetype==='quote'?{align:'center',valign:'middle'}:{})},i,name);
        blocks.push({id:`block-${i}`,block,rect:body,fontSize:archetype==='quote'?24:baseFont});
        break;
      }
      case 'table': {
        const headers=block.headers??[], rows=block.rows??[];
        if (!headers.length || rows.some(row=>row.length!==headers.length)) throw new Error('Table must have headers and rectangular rows');
        for(const value of [headers,...rows].flat()) assertText(value,'Table cell');
        rect={...rect,h:Math.min(rect.h,0.42*(rows.length+1))};
        const numeric=/^[+\-−]?(?:[$¥€£]\s*)?\d[\d,.\s]*(?:%|％|万元|亿元|元|万|亿|家|人|台|ms|GB|TB)?$/u;
        const cells=[headers,...rows].map((row,rowIndex)=>row.map(value=>({text:value,options:{bold:rowIndex===0,color:rowIndex===0?p.tableHeaderText:p.textColor,fill:rowIndex===0?p.tableHeaderBg:rowIndex%2?p.cardBg:p.accentLight,align:rowIndex===0?'left':numeric.test(value.trim())?'right':'left',valign:'middle'}})));
        add('table',rect,{objectName:name,border:{pt:.5,color:p.cardBorder},fontFace:theme.fontFamily,fontSize:12,color:p.textColor,fill:{color:p.cardBg},margin:0.05,rowH:rect.h/(rows.length+1),valign:'middle',autoPage:false},{rows:cells},i,'content');
        blocks.push({id:`block-${i}`,block,rect,fontSize:12});
        break;
      }
      case 'chart': {
        const d=block.data;
        if (!d?.labels.length || !d.series.length || d.series.some(se=>se.values.length!==d.labels.length || se.values.some(v=>!Number.isFinite(v)))) throw new Error('Chart requires matching finite labels/series values');
        for(const value of [...d.labels,...d.series.map(se=>se.name)]) assertText(value,'Chart label');
        const chartType=block.chartType==='column'?'bar':block.chartType??'bar';
        if (!['bar','line','pie','doughnut','area','radar'].includes(chartType)) throw new Error(`Chart type is not verified: ${chartType}`);
        add('chart',rect,{objectName:name,showLegend:true,chartColors:theme.chartColors,catAxisLabelColor:contentColor,valAxisLabelColor:contentColor,legendColor:contentColor},{chartType,data:d.series.map(se=>({name:se.name,labels:d.labels,values:se.values}))},i,'content');
        blocks.push({id:`block-${i}`,block,rect,fontSize:12});
        break;
      }
      case 'image':
        if(!block.src)throw new Error('image block requires src');
        add('image',rect,{path:block.src,objectName:name,altText:block.alt??''},{},i,'content');
        blocks.push({id:`block-${i}`,block,rect,fontSize:12});
        break;
      case 'shape': {
        const shape=block.shape??'rect';
        if(!['rect','roundRect','ellipse','circle','line','arrow'].includes(shape))throw new Error(`Unsupported shape: ${shape}`);
        const nativeShape=shape==='circle'?'ellipse':shape==='arrow'?'line':shape;
        add('shape',rect,{objectName:name,fill:{color:theme.accent},line:{color:theme.accent,width:1},...(shape==='arrow'?{endArrowType:'triangle'}:{})},{shape:nativeShape},i,'content');
        if(block.label)text(block.label,rect,{align:'center',valign:'middle',fontSize:12,color:contentColor},i,`${name}-label`);
        blocks.push({id:`block-${i}`,block,rect,fontSize:12});
        break;
      }
      case 'svg': throw new Error('SVG rendering is not verified; refusing to silently drop content');
      default:throw new Error(`unsupported block: ${block.type}`);
    }
    mapping.push({blockIndex:i,type:block.type,commandIds:commands.slice(first).filter(c=>c.sourceBlockIndex===i).map(c=>c.id)});
  }
  return {slideId:slide.id,index,kind:slide.kind,archetype,background:{color:theme.fill},theme,title:{rect:titleRect,fontSize:cover?34:26},commands,sources:mapping,blocks};
}

/** PptxGenJS 3.x assigns table IDs using tableNumber*slideNumber+1, which can
 * collide with ordinary drawing IDs on early slides. Only generated tables
 * are repaired here; the verifier still rejects any other ambiguous package. */
async function repairGeneratedTableIds(path:string):Promise<void> {
  const zip=await JSZip.loadAsync(await readFile(path),{checkCRC32:true});
  let changed=false;
  for(const part of Object.keys(zip.files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name))){
    const xml=await zip.file(part)!.async('string');
    const ids=[...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map(match=>Number(match[1]));
    const counts=new Map<number,number>();for(const id of ids)counts.set(id,(counts.get(id)??0)+1);
    let next=Math.max(1,...ids)+1,updated=false;
    const corrected=xml.replace(/<p:graphicFrame(?:\s[^>]*)?>[\s\S]*?<\/p:graphicFrame>/g,frame=>{
      if(!frame.includes('<a:tbl>'))return frame;
      return frame.replace(/(<p:cNvPr\b[^>]*\bid=")(\d+)(")/,(attribute,prefix,id,suffix)=>{
        if((counts.get(Number(id))??0)<2)return attribute;
        updated=true;counts.set(Number(id),counts.get(Number(id))!-1);
        return `${prefix}${next++}${suffix}`;
      });
    });
    if(updated){zip.file(part,corrected);changed=true;}
  }
  if(changed)await writeFile(path,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
}

export async function renderDeck(deck: DeckSpec, opts: RenderOptions): Promise<{path:string;slideCount:number;verification:RenderedDeckVerification}> {
  // Do not make destructive overwrite a side effect of rendering.
  const {access}=await import('node:fs/promises');
  try { await access(opts.outPath); throw new Error(`Output already exists: ${opts.outPath}`); }
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  checkCancelled(opts.signal);
  if(!deck.slides.length || deck.slides.some(slide=>!slide.id.trim()) || new Set(deck.slides.map(slide=>slide.id)).size!==deck.slides.length)throw new Error('Deck requires slides with non-empty unique IDs');
  const scenes:ResolvedSlideScene[]=[],preset=resolvePreset(deck,opts);
  for(let i=0;i<deck.slides.length;i++){
    if(i%8===0)await renderCheckpoint(opts.signal);
    scenes.push(composeSlide(deck,deck.slides[i],i,opts,preset));
  }
  const p=new PptxGenJS();
  p.defineLayout({name:'PRES_16x9',width:13.33,height:7.5});p.layout='PRES_16x9';
  if(deck.author)p.author=deck.author;p.title=deck.title;
  for(const scene of scenes){
    if(scene.index%8===0)await renderCheckpoint(opts.signal);
    const s=p.addSlide();s.background=scene.background;
    for(const c of scene.commands){
      switch(c.type){
        case 'text':s.addText(c.text!,c.options);break;
        case 'shape':s.addShape(c.shape!,c.options);break;
        case 'table':s.addTable(c.rows!,c.options);break;
        case 'chart':s.addChart(c.chartType!,c.data!,c.options);break;
        case 'image':s.addImage(c.options);break;
      }
    }
    const notes=deck.slides[scene.index].notes;if(notes)s.addNotes(notes);
  }
  const temporary=`${opts.outPath}.${randomUUID()}.tmp.pptx`;
  try {
    await p.writeFile({fileName:temporary});
    checkCancelled(opts.signal);
    await repairGeneratedTableIds(temporary);
    checkCancelled(opts.signal);
    const verification=await verifyRenderedDeck(temporary,deck,scenes);
    if(!verification.ok)throw new Error(`Rendered PPTX content verification failed: ${verification.missing.join('; ')}`);
    await renderCheckpoint(opts.signal);
    await copyFile(temporary,opts.outPath,constants.COPYFILE_EXCL);
    return {path:opts.outPath,slideCount:scenes.length,verification:{...verification,path:opts.outPath}};
  }finally{await unlink(temporary).catch(()=>undefined);}
}

export function fontSizeFor(style: string | undefined): number {
  switch(style){case 'h1':return 36;case 'h2':return 28;case 'h3':return 22;case 'small':return 12;case 'caption':return 11;default:return 16;}
}
