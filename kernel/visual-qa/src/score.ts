// 评分聚合 + Revision 建议生成
import { allIssues } from './rules.js';
import { charCount } from './rules.js';
import type { QaIssue, QaReport, QaSlide, RevisionSuggestion, SlideScore, VisualQaOptions } from './types.js';

const SEVERITY_WEIGHT = { info: 1, warn: 3, error: 10 } as const;

export function scoreSlide(slide: QaSlide, issues: QaIssue[]): SlideScore {
  const slideIssues = issues.filter((i) => i.slide === slide.index);
  const penalty = slideIssues.reduce((n, i) => n + SEVERITY_WEIGHT[i.severity], 0);
  // 基础 100，减去惩罚；密度超高额外扣分
  let score = Math.max(0, 100 - penalty * 6);
  const n = charCount(slide);
  if (n > 1200) score -= 20;
  else if (n > 600) score -= 8;
  return { slide: slide.index, score, issues: slideIssues };
}

export function buildRevision(slides: QaSlide[], issues: QaIssue[]): RevisionSuggestion[] {
  const out: RevisionSuggestion[] = [];
  for (const i of issues) {
    if (i.rule === 'density' && i.severity === 'error') {
      out.push({ slide: i.slide, action: 'split', reason: i.message });
    } else if (i.rule === 'density' && i.severity === 'warn') {
      out.push({ slide: i.slide, action: 'reduce_text', reason: i.message });
    } else if (i.rule === 'font-size') {
      out.push({ slide: i.slide, action: 'increase_font', reason: i.message });
    } else if (i.rule === 'contrast') {
      out.push({ slide: i.slide, action: 'fix_contrast', reason: i.message });
    } else if (i.rule === 'whitespace') {
      out.push({ slide: i.slide, action: 'increase_margin', reason: i.message });
    } else if (i.rule === 'rhythm') {
      out.push({ slide: i.slide, action: 'add_visual', reason: i.message });
    }
  }
  return out;
}

export function runVisualQa(
  slides: QaSlide[],
  opts: VisualQaOptions = {},
  canvas: { w: number; h: number } = { w: 13.333, h: 7.5 },
): QaReport {
  const issues: QaIssue[] = allIssues(slides, opts, canvas);
  const slideScores = slides.map((s) => scoreSlide(s, issues));
  if (slideScores.length === 0) {
    return { overall: 100, slides: [], issues: [], revision: [] };
  }
  const overall = Math.round(
    slideScores.reduce((n, s) => n + s.score, 0) / Math.max(slideScores.length, 1),
  );
  return {
    overall,
    slides: slideScores,
    issues,
    revision: buildRevision(slides, issues),
  };
}
