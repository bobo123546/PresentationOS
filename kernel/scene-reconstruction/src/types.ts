// SceneIR Types & Interfaces for Layered Reconstruction (P13 / TASK-0014)

export type SceneElementType =
  | 'heading'
  | 'subheading'
  | 'paragraph'
  | 'card'
  | 'table'
  | 'metric'
  | 'raster_graphic'
  | 'container';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ElementStyle {
  color?: string;
  backgroundColor?: string;
  fontSize?: number;
  fontWeight?: string;
  align?: 'left' | 'center' | 'right';
  borderColor?: string;
}

export interface SceneElement {
  id: string;
  type: SceneElementType;
  bounds: BoundingBox;
  text?: string;
  tableData?: string[][];
  confidence: number; // 0.0 to 1.0
  isEditable: boolean;
  style?: ElementStyle;
  subElements?: SceneElement[];
}

export interface ScenePalette {
  dominantHex?: string;
  backgroundHex?: string;
  accentHex?: string;
  textHex?: string;
}

export interface SceneMetrics {
  totalElements: number;
  editableCount: number;
  editableCoverageRatio: number;
  averageConfidence: number;
  uncertainCount: number;
}

export interface SceneIR {
  version: '1.0.0';
  sourceType: 'screenshot' | 'pptx_slide' | 'pdf_page';
  sourcePath?: string;
  dimensions: { width: number; height: number };
  palette?: ScenePalette;
  elements: SceneElement[];
  metrics: SceneMetrics;
}

export interface CorrectionPatch {
  elementId: string;
  action: 'update_text' | 'update_bounds' | 'reclassify' | 'set_editable' | 'delete';
  newText?: string;
  newBounds?: BoundingBox;
  newType?: SceneElementType;
  isEditable?: boolean;
}

export interface DiffItem {
  elementId: string;
  type: SceneElementType;
  textMatch: boolean;
  iouScore: number;
  confidence: number;
}

export interface ReconstructionDiff {
  totalCompared: number;
  matchedCount: number;
  averageIoU: number;
  textPreservationRate: number;
  diffItems: DiffItem[];
}

export interface ReconstructResult {
  sceneIr: SceneIR;
  deckSpec: any;
  editableCoverageRatio: number;
  diff: ReconstructionDiff;
}
