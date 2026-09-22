import type { AppliedChange, DeckLike, RevisionResult, RevisionSuggestionLike } from './types.js';
export declare const REDUCE_TEXT_MAX_CHARS = 300;
/** 单块文本截断（保留前缀 + …） */
export declare function truncate(text: string, max?: number): string;
/** 页面字符数 */
export declare function slideChars(slide: {
    blocks: {
        text?: string;
    }[];
}): number;
export declare function contrast(fg: string, bg: string): number;
/** 应用单条建议（slide 为 1-based） */
export declare function applySuggestion(deck: DeckLike, suggestion: RevisionSuggestionLike, changes: AppliedChange[]): void;
/** 批量应用一批建议（含去重：同页同 action 只一次） */
export declare function applyRevisions(deck: DeckLike, suggestions: RevisionSuggestionLike[]): RevisionResult;
