// PHASE 9 Visual QA（确定性规则版，不依赖模型）—— 类型定义
// 对 DeckSpec + 几何评分：密度/层级/对比度/多样性/留白/重叠
// 之后可叠加 VLM 审美评审（BLOCKED-MODEL），本模块提供确定性基线

export interface QaBlock {
  id: string;
  kind: string; // title | body | bullet | table | quote | image | chart
  text?: string;
  rect: { x: number; y: number; w: number; h: number };
  style?: { bold?: boolean; color?: string; bg?: string; fontSize?: number };
}

export interface QaSlide {
  index: number;
  kind: string;
  title?: string;
  blocks: QaBlock[];
}

export interface QaIssue {
  slide: number;
  rule: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
}

export interface SlideScore {
  slide: number;
  score: number; // 0-100
  issues: QaIssue[];
}

export interface QaReport {
  overall: number;
  slides: SlideScore[];
  issues: QaIssue[];
  revision: RevisionSuggestion[];
}

export interface RevisionSuggestion {
  slide: number;
  action: 'split' | 'reduce_text' | 'increase_font' | 'fix_contrast' | 'increase_margin' | 'add_visual';
  reason: string;
}

export interface VisualQaOptions {
  densityMaxChars?: number; // 每页字符上限（超出 warn）
  densityHardMaxChars?: number; // 每页字符硬上限（超出 error）
  minFontSize?: number; // 正文最小字号
  minContrast?: number; // 前景/背景最小对比度
  titleFontSize?: number; // 标题基准字号
}
