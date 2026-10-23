import type { CorrectionPatch, SceneIR } from './types.js';
import { calculateSceneMetrics } from './metrics.js';

export function applyCorrectionPatches(
  scene: SceneIR,
  patches: CorrectionPatch[]
): SceneIR {
  // Deep clone elements to preserve immutability
  const updatedElements = scene.elements.map((el) => ({ ...el, bounds: { ...el.bounds }, style: el.style ? { ...el.style } : undefined }));

  for (const patch of patches) {
    const idx = updatedElements.findIndex((e) => e.id === patch.elementId);
    if (idx === -1) continue;

    switch (patch.action) {
      case 'update_text':
        if (patch.newText !== undefined) {
          updatedElements[idx].text = patch.newText;
          updatedElements[idx].confidence = 1.0; // User-verified text gets 1.0 confidence
        }
        break;
      case 'update_bounds':
        if (patch.newBounds) {
          updatedElements[idx].bounds = { ...patch.newBounds };
        }
        break;
      case 'reclassify':
        if (patch.newType) {
          updatedElements[idx].type = patch.newType;
          if (patch.newType !== 'raster_graphic') {
            updatedElements[idx].isEditable = true;
          }
        }
        break;
      case 'set_editable':
        if (patch.isEditable !== undefined) {
          updatedElements[idx].isEditable = patch.isEditable;
        }
        break;
      case 'delete':
        updatedElements.splice(idx, 1);
        break;
    }
  }

  const updatedMetrics = calculateSceneMetrics(updatedElements);

  return {
    ...scene,
    elements: updatedElements,
    metrics: updatedMetrics,
  };
}
