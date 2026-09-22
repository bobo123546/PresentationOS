export interface QaBlock {
    id: string;
    kind: string;
    text?: string;
    rect: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    style?: {
        bold?: boolean;
        color?: string;
        bg?: string;
        fontSize?: number;
    };
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
    score: number;
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
    densityMaxChars?: number;
    densityHardMaxChars?: number;
    minFontSize?: number;
    minContrast?: number;
    titleFontSize?: number;
}
