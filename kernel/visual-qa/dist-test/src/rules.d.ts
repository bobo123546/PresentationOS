import type { QaBlock, QaIssue, QaSlide, VisualQaOptions } from './types.js';
export declare function charCount(slide: QaSlide): number;
export declare function ruleDensity(slide: QaSlide, opts: VisualQaOptions): QaIssue[];
export declare function ruleFontSize(slide: QaSlide, opts: VisualQaOptions): QaIssue[];
export declare function ruleContrast(slide: QaSlide, opts: VisualQaOptions): QaIssue[];
export declare function ruleTitleHierarchy(slide: QaSlide, opts: VisualQaOptions): QaIssue[];
export declare function ruleOverlap(rects: {
    id: string;
    rect: QaBlock['rect'];
}[], slideIndex: number): QaIssue[];
export declare function ruleWhitespace(slide: QaSlide, canvas: {
    w: number;
    h: number;
}): QaIssue[];
/** 相邻页版式多样性：相同 kind 序列连续重复 >= 3 记 warn */
export declare function ruleRhythm(kinds: string[]): QaIssue[];
export declare function allIssues(slides: QaSlide[], opts: VisualQaOptions, canvas: {
    w: number;
    h: number;
}): QaIssue[];
