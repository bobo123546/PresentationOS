import type { SceneElement, SceneMetrics } from './types.js';

export function calculateSceneMetrics(elements: SceneElement[]): SceneMetrics {
  const totalElements = elements.length;
  if (totalElements === 0) {
    return {
      totalElements: 0,
      editableCount: 0,
      editableCoverageRatio: 1.0,
      averageConfidence: 1.0,
      uncertainCount: 0,
    };
  }

  let editableCount = 0;
  let totalConfidence = 0;
  let uncertainCount = 0;

  for (const el of elements) {
    if (el.isEditable) {
      editableCount++;
    }
    totalConfidence += el.confidence;
    // Elements with confidence < 0.7 or explicit uncertain types are marked uncertain
    if (el.confidence < 0.70 || el.type === 'raster_graphic') {
      uncertainCount++;
    }
  }

  const editableCoverageRatio = Math.round((editableCount / totalElements) * 1000) / 1000;
  const averageConfidence = Math.round((totalConfidence / totalElements) * 1000) / 1000;

  return {
    totalElements,
    editableCount,
    editableCoverageRatio,
    averageConfidence,
    uncertainCount,
  };
}
