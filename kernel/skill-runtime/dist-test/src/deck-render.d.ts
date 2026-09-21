export interface RenderMarkdownResult {
    ok: boolean;
    error?: string;
    qaArtifacts: string[];
}
export declare function renderMarkdownDeck(markdown: string, outPath: string, reference?: string, title?: string): Promise<RenderMarkdownResult>;
