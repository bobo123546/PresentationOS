// Layout Engine（总方案 PHASE 8）：语义 LayoutIR → 几何矩形（英寸）
// 规则：显式 below/rightOf 优先；其余按 direction 流式布局；width/height 为容器比例。

export interface Rect {
  x: number; y: number; w: number; h: number;
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
  schema?: 'layout-ir';
  version?: '1';
  width: number;
  height: number;
  direction?: 'row' | 'column';
  gap?: string;
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  children?: LayoutNode[];
}

export const GAP_INCH: Record<string, number> = { xs: 0.1, sm: 0.2, md: 0.3, lg: 0.5, xl: 0.8 };
const DEFAULT_PADDING = 0.5;

interface Frame { x: number; y: number; w: number; h: number; }

function anchorOffset(a: string | undefined, w: number, h: number, cw: number, ch: number): { ox: number; oy: number } {
  switch (a) {
    case 'top-left': return { ox: 0, oy: 0 };
    case 'top-center': return { ox: (cw - w) / 2, oy: 0 };
    case 'top-right': return { ox: cw - w, oy: 0 };
    case 'middle-left': return { ox: 0, oy: (ch - h) / 2 };
    case 'center': return { ox: (cw - w) / 2, oy: (ch - h) / 2 };
    case 'middle-right': return { ox: cw - w, oy: (ch - h) / 2 };
    case 'bottom-left': return { ox: 0, oy: ch - h };
    case 'bottom-center': return { ox: (cw - w) / 2, oy: ch - h };
    case 'bottom-right': return { ox: cw - w, oy: ch - h };
    default: return { ox: 0, oy: 0 };
  }
}

function sizeOf(node: LayoutNode, availW: number, availH: number): { w: number; h: number } {
  let w = node.width !== undefined ? node.width * availW : availW;
  let h = node.height !== undefined ? node.height * availH : availH;
  // 无明确高度时按比例：文本类节点给一个合理高度
  if (node.height === undefined) {
    h = node.kind === 'spacer' ? 0 : availH;
  }
  return { w: Math.max(0.1, w), h: Math.max(0.1, h) };
}

/** 解析 layout，返回 children 顺序对应的几何矩形（含子节点递归） */
export function resolveLayout(layout: LayoutIR): Map<string, Rect> {
  const result = new Map<string, Rect>();
  const pad = layout.padding ?? {};
  const pt = pad.top ?? DEFAULT_PADDING;
  const pr = pad.right ?? DEFAULT_PADDING;
  const pb = pad.bottom ?? DEFAULT_PADDING;
  const pl = pad.left ?? DEFAULT_PADDING;
  const innerW = Math.max(0.5, layout.width - pl - pr);
  const innerH = Math.max(0.5, layout.height - pt - pb);
  const gap = GAP_INCH[layout.gap ?? 'md'] ?? GAP_INCH.md;
  const children = layout.children ?? [];

  // 已定位（below/rightOf）的节点
  const positioned = new Set<string>();

  // 流式排布（非显式定位）
  const flow = children.filter((c) => !c.below && !c.rightOf);
  const dir = layout.direction ?? 'column';
  const MIN_EXTENT = 0.05; // 防止负尺寸导致 PowerPoint 打不开
  let cursor = 0;
  for (const node of flow) {
    const size = sizeOf(node, innerW, innerH);
    let frame: Frame;
    if (dir === 'column') {
      const available = innerH - cursor;
      const h = Math.max(MIN_EXTENT, Math.min(size.h, available));
      frame = { x: pl, y: pt + cursor, w: size.w, h };
      cursor += h + gap;
    } else {
      const available = innerW - cursor;
      const w = Math.max(MIN_EXTENT, Math.min(size.w, available));
      frame = { x: pl + cursor, y: pt, w, h: size.h };
      cursor += w + gap;
    }
    const off = anchorOffset(node.anchor, frame.w, frame.h, innerW, innerH);
    result.set(node.id, { x: frame.x + off.ox, y: frame.y + off.oy, w: frame.w, h: frame.h });
    positioned.add(node.id);
    if (node.children && node.children.length > 0) {
      placeChildren(node, frame, result);
    }
  }

  // 显式定位（below / rightOf）
  for (const node of children) {
    if (positioned.has(node.id)) continue;
    const ref = node.below ?? node.rightOf;
    const refRect = ref ? result.get(ref) : undefined;
    if (!refRect) continue; // 引用不存在则跳过（v1 宽容）
    const size = sizeOf(node, innerW, innerH);
    const gapX = GAP_INCH[node.gap ?? 'md'] ?? gap;
    const x = node.rightOf ? refRect.x + refRect.w + gapX : refRect.x;
    const y = node.below ? refRect.y + refRect.h + gapX : refRect.y;
    const frame: Frame = { x, y, w: size.w, h: size.h };
    result.set(node.id, frame);
    if (node.children && node.children.length > 0) {
      placeChildren(node, frame, result);
    }
  }

  return result;
}

function placeChildren(parent: LayoutNode, parentFrame: Frame, result: Map<string, Rect>): void {
  const kids = parent.children ?? [];
  const gap = GAP_INCH[parent.gap ?? 'md'] ?? GAP_INCH.md;
  const MIN_EXTENT = 0.05;
  let cursor = 0;
  for (const k of kids) {
    const size = sizeOf(k, parentFrame.w, parentFrame.h);
    // 简化：子节点按 column 流式排布
    const h = Math.max(MIN_EXTENT, Math.min(size.h, parentFrame.h - cursor));
    result.set(k.id, { x: parentFrame.x, y: parentFrame.y + cursor, w: size.w, h });
    cursor += h + gap;
  }
}
