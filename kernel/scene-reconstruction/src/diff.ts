import type { BoundingBox, DiffItem, ReconstructionDiff, SceneElement } from './types.js';

export function calculateIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);

  const intersectionW = Math.max(0, x2 - x1);
  const intersectionH = Math.max(0, y2 - y1);
  const intersectionArea = intersectionW * intersectionH;

  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  const unionArea = areaA + areaB - intersectionArea;

  if (unionArea <= 0) return 1.0;
  return Math.round((intersectionArea / unionArea) * 1000) / 1000;
}

export function computeReconstructionDiff(
  originalElements: SceneElement[],
  reconstructedElements: SceneElement[]
): ReconstructionDiff {
  const reconMap = new Map<string, SceneElement>();
  for (const el of reconstructedElements) {
    reconMap.set(el.id, el);
  }

  const diffItems: DiffItem[] = [];
  let matchedCount = 0;
  let totalIoU = 0;
  let textMatchCount = 0;

  for (const orig of originalElements) {
    const recon = reconMap.get(orig.id);
    if (!recon) {
      diffItems.push({
        elementId: orig.id,
        type: orig.type,
        textMatch: false,
        iouScore: 0,
        confidence: orig.confidence,
      });
      continue;
    }

    const iou = calculateIoU(orig.bounds, recon.bounds);
    const textMatch = !orig.text || (recon.text?.trim() === orig.text?.trim());

    if (textMatch) textMatchCount++;
    if (iou > 0.5) matchedCount++;
    totalIoU += iou;

    diffItems.push({
      elementId: orig.id,
      type: orig.type,
      textMatch,
      iouScore: iou,
      confidence: orig.confidence,
    });
  }

  const totalCompared = originalElements.length;
  const averageIoU = totalCompared > 0 ? Math.round((totalIoU / totalCompared) * 1000) / 1000 : 1.0;
  const textPreservationRate =
    totalCompared > 0 ? Math.round((textMatchCount / totalCompared) * 1000) / 1000 : 1.0;

  return {
    totalCompared,
    matchedCount,
    averageIoU,
    textPreservationRate,
    diffItems,
  };
}
