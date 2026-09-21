export interface ColorUsage {
    hex: string;
    count: number;
}
export interface FontUsage {
    name: string;
    count: number;
}
export interface TitlePosition {
    x: number;
    y: number;
    w: number;
    h: number;
    count: number;
}
export interface TemplateDna {
    schema: 'template-dna';
    version: '1';
    source: string;
    slideCount: number;
    masters: string[];
    layouts: string[];
    colors: ColorUsage[];
    fonts: FontUsage[];
    titlePositions: TitlePosition[];
    shapeStyle: {
        fills: ColorUsage[];
        lineColors: ColorUsage[];
        lineWidths: Array<{
            width: number;
            count: number;
        }>;
    };
    extractedAt: string;
}
/** 从 PPTX 文件 Buffer 提取 TemplateDNA */
export declare function extractTemplateDna(pptxBuffer: Buffer, source?: string): Promise<TemplateDna>;
