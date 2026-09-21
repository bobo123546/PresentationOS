import type { Rect } from './layout-engine.js';
export interface SlideBlock {
    type: string;
    text?: string;
    style?: string;
    src?: string;
    alt?: string;
    chartType?: string;
    data?: {
        labels: string[];
        series: Array<{
            name: string;
            values: number[];
        }>;
    };
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
}
export interface DeckSpec {
    title: string;
    subtitle?: string;
    author?: string;
    designTokens?: Record<string, unknown>;
    slides: DeckSlide[];
}
export interface RenderOptions {
    outPath: string;
    /** layout 解析器：slide → Map<blockId, Rect> */
    resolveRects: (slide: DeckSlide) => Map<string, Rect>;
}
export declare function renderDeck(deck: DeckSpec, opts: RenderOptions): Promise<{
    path: string;
    slideCount: number;
}>;
