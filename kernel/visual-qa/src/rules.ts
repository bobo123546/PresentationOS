// 确定性审美规则（每页/每 deck）
import type { QaBlock, QaIssue, QaSlide, VisualQaOptions } from './types.js';

const DEFAULT = {
  densityMaxChars: 600,
  densityHardMaxChars: 1200,
  minFontSize: 10,
  minContrast: 3.0,
  titleFontSize: 24,
};

/** WCAG 相对亮度（0-1） */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 对比度（1-21） */
function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function charCount(slide: QaSlide): number {
  return slide.blocks.reduce((n, b) => n + (b.text?.length ?? 0), 0);
}

export function ruleDensity(slide: QaSlide, opts: VisualQaOptions): QaIssue[] {
  const max = opts.densityMaxChars ?? DEFAULT.densityMaxChars;
  const hard = opts.densityHardMaxChars ?? DEFAULT.densityHardMaxChars;
  const n = charCount(slide);
  const out: QaIssue[] = [];
  if (n > hard) {
    out.push({ slide: slide.index, rule: 'density', severity: 'error', message: `第${slide.index}页 ${n} 字符，超过硬上限 ${hard}，必须拆分` });
  } else if (n > max) {
    out.push({ slide: slide.index, rule: 'density', severity: 'warn', message: `第${slide.index}页 ${n} 字符，超过建议上限 ${max}，建议精简或拆分` });
  }
  return out;
}

export function ruleFontSize(slide: QaSlide, opts: VisualQaOptions): QaIssue[] {
  const min = opts.minFontSize ?? DEFAULT.minFontSize;
  const out: QaIssue[] = [];
  for (const b of slide.blocks) {
    const fs = b.style?.fontSize ?? 12;
    if (b.kind === 'body' && fs < min) {
      out.push({ slide: slide.index, rule: 'font-size', severity: 'warn', message: `第${slide.index}页块 ${b.id} 字号 ${fs}pt < ${min}pt` });
    }
  }
  return out;
}

export function ruleContrast(slide: QaSlide, opts: VisualQaOptions): QaIssue[] {
  const min = opts.minContrast ?? DEFAULT.minContrast;
  const out: QaIssue[] = [];
  for (const b of slide.blocks) {
    const fg = b.style?.color;
    const bg = b.style?.bg;
    if (!fg || !bg) continue;
    if (!/^[0-9a-fA-F]{6}$/.test(fg) || !/^[0-9a-fA-F]{6}$/.test(bg)) continue;
    const c = contrast(fg, bg);
    if (c < min) {
      out.push({ slide: slide.index, rule: 'contrast', severity: 'warn', message: `第${slide.index}页块 ${b.id} 对比度 ${c.toFixed(1)} < ${min}（${fg}/${bg}）` });
    }
  }
  return out;
}

export function ruleTitleHierarchy(slide: QaSlide, opts: VisualQaOptions): QaIssue[] {
  const titleMin = opts.titleFontSize ?? DEFAULT.titleFontSize;
  const out: QaIssue[] = [];
  if (!slide.title) return out;
  const titleBlocks = slide.blocks.filter((b) => b.kind === 'title');
  for (const t of titleBlocks) {
    if ((t.style?.fontSize ?? titleMin) < titleMin) {
      out.push({ slide: slide.index, rule: 'title-hierarchy', severity: 'warn', message: `第${slide.index}页标题字号过小（${t.style?.fontSize}pt < ${titleMin}pt）` });
    }
  }
  return out;
}

export function ruleOverlap(rects: { id: string; rect: QaBlock['rect'] }[], slideIndex: number): QaIssue[] {
  const out: QaIssue[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].rect;
      const b = rects[j].rect;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0) {
        const area = ox * oy;
        const aArea = Math.max(a.w * a.h, 0.0001);
        if (area / aArea > 0.2) {
          out.push({ slide: slideIndex, rule: 'overlap', severity: 'error', message: `第${slideIndex}页 ${rects[i].id} 与 ${rects[j].id} 重叠` });
        }
      }
    }
  }
  return out;
}

export function ruleWhitespace(slide: QaSlide, canvas: { w: number; h: number }): QaIssue[] {
  const out: QaIssue[] = [];
  const total = canvas.w * canvas.h;
  const used = slide.blocks.reduce((n, b) => n + Math.max(b.rect.w, 0) * Math.max(b.rect.h, 0), 0);
  const ratio = used / total;
  if (ratio > 0.85) {
    out.push({ slide: slide.index, rule: 'whitespace', severity: 'warn', message: `第${slide.index}页内容面积占比 ${(ratio * 100).toFixed(0)}%，留白不足` });
  }
  return out;
}

/** 相邻页版式多样性：相同 kind 序列连续重复 >= 3 记 warn */
export function ruleRhythm(kinds: string[]): QaIssue[] {
  const out: QaIssue[] = [];
  let run = 1;
  for (let i = 1; i < kinds.length; i++) {
    if (kinds[i] === kinds[i - 1]) {
      run++;
      if (run === 3) {
        out.push({ slide: i + 1, rule: 'rhythm', severity: 'warn', message: `第${i - 1}~${i + 1} 页连续相同版式 ${kinds[i]}，节奏单一` });
      }
    } else {
      run = 1;
    }
  }
  return out;
}

export function allIssues(slides: QaSlide[], opts: VisualQaOptions, canvas: { w: number; h: number }): QaIssue[] {
  const out: QaIssue[] = [];
  for (const s of slides) {
    out.push(...ruleDensity(s, opts));
    out.push(...ruleFontSize(s, opts));
    out.push(...ruleContrast(s, opts));
    out.push(...ruleTitleHierarchy(s, opts));
    out.push(...ruleOverlap(s.blocks.map((b) => ({ id: b.id, rect: b.rect })), s.index));
    out.push(...ruleWhitespace(s, canvas));
  }
  out.push(...ruleRhythm(slides.map((s) => s.kind)));
  return out;
}
