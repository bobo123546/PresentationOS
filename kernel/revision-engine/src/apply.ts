// 规则修订实现：按建议逐条应用（mutate deck 副本）
import type { AppliedChange, DeckLike, RevisionResult, RevisionSuggestionLike } from './types.js';

export const REDUCE_TEXT_MAX_CHARS = 300;

/** 单块文本截断（保留前缀 + …） */
export function truncate(text: string, max = REDUCE_TEXT_MAX_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/** 页面字符数 */
export function slideChars(slide: { blocks: { text?: string }[] }): number {
  return slide.blocks.reduce((n, b) => n + (b.text?.length ?? 0), 0);
}

function cloneDeck(deck: DeckLike): DeckLike {
  return JSON.parse(JSON.stringify(deck)) as DeckLike;
}

/** 拆页：blocks 前后对半分，后半进入新页（原 kind + 标题加「（续）」） */
function applySplit(deck: DeckLike, slide: DeckSlideAt, idx: number, changes: AppliedChange[]): void {
  const blocks = slide.blocks;
  if (blocks.length < 2) {
    changes.push({ slide: String(idx + 1), action: 'split', detail: '跳过：该页仅有 1 个块，无法拆页' });
    return;
  }
  const mid = Math.ceil(blocks.length / 2);
  const secondHalf = blocks.splice(mid);
  const newSlide: DeckSlideAt = {
    id: `${slide.id}-part2`,
    kind: slide.kind,
    title: `${slide.title}（续）`,
    blocks: secondHalf,
  };
  deck.slides.splice(idx + 1, 0, newSlide);
  changes.push({ slide: String(idx + 1), action: 'split', detail: `拆为 ${mid} + ${secondHalf.length} 块` });
}

function applyReduceText(deck: DeckLike, slide: DeckSlideAt, changes: AppliedChange[]): void {
  let n = 0;
  for (const b of slide.blocks) {
    if (b.type === 'text' && b.text && b.text.length > REDUCE_TEXT_MAX_CHARS) {
      b.text = truncate(b.text);
      n++;
    }
  }
  changes.push({ slide: slide.id, action: 'reduce_text', detail: n > 0 ? `截断 ${n} 个超长块` : '无需截断' });
}

function applyIncreaseFont(deck: DeckLike, slide: DeckSlideAt, changes: AppliedChange[]): void {
  let n = 0;
  for (const b of slide.blocks) {
    if (b.type === 'text') {
      b.fontScale = Math.max(b.fontScale ?? 1, 1.25);
      n++;
    }
  }
  changes.push({ slide: slide.id, action: 'increase_font', detail: `正文字号 ×1.25（${n} 块）` });
}

/** WCAG 相对亮度 */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function applyFixContrast(deck: DeckLike, slide: DeckSlideAt, changes: AppliedChange[]): void {
  let n = 0;
  for (const b of slide.blocks) {
    if (b.color && /^[0-9a-fA-F]{6}$/.test(b.color)) {
      const bg: string = slide.kind === 'content' || slide.kind === 'data' || slide.kind === 'summary' || slide.kind === 'quote' ? 'FFFFFF' : '111827';
      const c = contrast(b.color, bg);
      if (c < 3) {
        // 背景亮 -> 深色字；背景暗 -> 白字
        const bgDark = bg === '111827' || bg === '1F2937';
        b.color = bgDark ? 'FFFFFF' : '111111';
        n++;
      }
    }
  }
  changes.push({ slide: slide.id, action: 'fix_contrast', detail: n > 0 ? `修复 ${n} 个低对比块` : '无低对比块' });
}

/** 连续相同版式打断：content 变 section（深色），视觉差异显著 */
function applyAddVisual(deck: DeckLike, slide: DeckSlideAt, changes: AppliedChange[]): void {
  const prev = deck.slides[idxOf(deck, slide) - 1];
  const prevKind = prev?.kind;
  if (prevKind === slide.kind && (slide.kind === 'content' || slide.kind === 'section')) {
    slide.kind = slide.kind === 'content' ? 'section' : 'content';
    changes.push({ slide: slide.id, action: 'add_visual', detail: `版式 ${prevKind} -> ${slide.kind}（打断节奏）` });
  } else {
    changes.push({ slide: slide.id, action: 'add_visual', detail: '无需打断（非连续相同版式）' });
  }
}

type DeckSlideAt = DeckLike['slides'][number];

function idxOf(deck: DeckLike, slide: DeckSlideAt): number {
  return deck.slides.findIndex((s) => s.id === slide.id);
}

/** 应用单条建议（slide 为 1-based） */
export function applySuggestion(deck: DeckLike, suggestion: RevisionSuggestionLike, changes: AppliedChange[]): void {
  const idx = suggestion.slide - 1;
  if (idx < 0 || idx >= deck.slides.length) {
    changes.push({ slide: String(suggestion.slide), action: suggestion.action, detail: "跳过：页码越界" });
    return;
  }
  const slide = deck.slides[idx];
  switch (suggestion.action) {
    case 'split': applySplit(deck, slide, idx, changes); break;
    case 'reduce_text': applyReduceText(deck, slide, changes); break;
    case 'increase_font': applyIncreaseFont(deck, slide, changes); break;
    case 'fix_contrast': applyFixContrast(deck, slide, changes); break;
    case 'increase_margin': applyReduceText(deck, slide, changes); changes[changes.length - 1].action = 'increase_margin'; changes[changes.length - 1].detail += '（留白不足→精简文本）'; break;
    case 'add_visual': applyAddVisual(deck, slide, changes); break;
  }
}

/** 批量应用一批建议（含去重：同页同 action 只一次） */
export function applyRevisions(deck: DeckLike, suggestions: RevisionSuggestionLike[]): RevisionResult {
  const out = cloneDeck(deck);
  const changes: AppliedChange[] = [];
  const seen = new Set<string>();
  for (const s of suggestions) {
    const key = `${s.slide}:${s.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    applySuggestion(out, s, changes);
  }
  return { ok: true, deck: out, changes };
}
