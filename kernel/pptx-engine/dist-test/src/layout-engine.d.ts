export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface LayoutNode {
    id: string;
    kind: string;
    width?: number;
    height?: number;
    anchor?: string;
    align?: string;
    alignVertical?: string;
    below?: string;
    rightOf?: string;
    gap?: string;
    children?: LayoutNode[];
}
export interface LayoutIR {
    width: number;
    height: number;
    direction?: 'row' | 'column';
    gap?: string;
    padding?: {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
    };
    children?: LayoutNode[];
}
export declare const GAP_INCH: Record<string, number>;
/** 解析 layout，返回 children 顺序对应的几何矩形（含子节点递归） */
export declare function resolveLayout(layout: LayoutIR): Map<string, Rect>;
