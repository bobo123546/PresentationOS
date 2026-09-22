export interface DeckSlideLike {
    id: string;
    kind: string;
    title: string;
    blocks: {
        type: string;
        text?: string;
        style?: string;
        fontScale?: number;
        color?: string;
    }[];
}
export interface DeckLike {
    title: string;
    slides: DeckSlideLike[];
}
export interface RevisionSuggestionLike {
    slide: number;
    action: 'split' | 'reduce_text' | 'increase_font' | 'fix_contrast' | 'increase_margin' | 'add_visual';
    reason: string;
}
export interface AppliedChange {
    slide: string;
    action: string;
    detail: string;
}
export interface RevisionResult {
    ok: boolean;
    deck: DeckLike;
    changes: AppliedChange[];
}
