import type { QaIssue, QaReport, QaSlide, RevisionSuggestion, SlideScore, VisualQaOptions } from './types.js';
export declare function scoreSlide(slide: QaSlide, issues: QaIssue[]): SlideScore;
export declare function buildRevision(slides: QaSlide[], issues: QaIssue[]): RevisionSuggestion[];
export declare function runVisualQa(slides: QaSlide[], opts?: VisualQaOptions, canvas?: {
    w: number;
    h: number;
}): QaReport;
