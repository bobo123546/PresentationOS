import type { ReconstructResult, SceneElement, SceneIR } from './types.js';
import { computeReconstructionDiff } from './diff.js';
import { calculateSceneMetrics } from './metrics.js';

export interface ReconstructOptions {
  deckTitle?: string;
  defaultFont?: string;
  enforceMinimumConfidence?: number;
}

export function reconstructDeckFromScene(
  scene: SceneIR,
  options: ReconstructOptions = {}
): ReconstructResult {
  const minConfidence = options.enforceMinimumConfidence ?? 0.3;
  const filteredElements = scene.elements.filter((el) => el.confidence >= minConfidence);

  // Group elements into Slide Spec
  const blocks: any[] = [];
  const reconstructedElements: SceneElement[] = [];

  let slideTitle = options.deckTitle ?? 'Reconstructed Slide';
  let slideKind: 'cover' | 'content' = 'content';

  // Sort elements by vertical position (y), then horizontal (x)
  const sorted = [...filteredElements].sort((a, b) => {
    if (Math.abs(a.bounds.y - b.bounds.y) > 0.05) {
      return a.bounds.y - b.bounds.y;
    }
    return a.bounds.x - b.bounds.x;
  });

  for (let i = 0; i < sorted.length; i++) {
    const el = sorted[i];

    if (el.type === 'heading' && (!slideTitle || slideTitle === 'Reconstructed Slide')) {
      slideTitle = el.text || 'Reconstructed Slide';
      slideKind = el.bounds.y > 0.3 ? 'cover' : 'content';
      reconstructedElements.push({ ...el });
      continue;
    }

    if (el.type === 'table' && el.tableData && el.tableData.length > 0) {
      const headers = el.tableData[0];
      const rows = el.tableData.slice(1);
      blocks.push({
        type: 'table',
        headers,
        rows,
      });
      reconstructedElements.push({ ...el });
      continue;
    }

    if (el.type === 'metric') {
      const metricText = el.text ?? '';
      blocks.push({
        type: 'text',
        text: metricText,
        style: 'h2',
      });
      reconstructedElements.push({ ...el });
      continue;
    }

    if (el.type === 'heading' || el.type === 'subheading') {
      blocks.push({
        type: 'text',
        text: el.text || '',
        style: el.type === 'heading' ? 'h2' : 'h3',
      });
      reconstructedElements.push({ ...el });
      continue;
    }

    if (el.type === 'paragraph' || el.type === 'card') {
      blocks.push({
        type: 'text',
        text: el.text || '',
        style: 'body',
      });
      reconstructedElements.push({ ...el });
      continue;
    }

    if (el.type === 'raster_graphic') {
      // Raster graphic placeholder (flagged as non-editable, zero hallucination)
      reconstructedElements.push({
        ...el,
        isEditable: false,
      });
      continue;
    }
  }

  // If no blocks were created (e.g. only title), add a default placeholder body
  if (blocks.length === 0) {
    blocks.push({
      type: 'text',
      text: 'Reconstructed Presentation Content',
      style: 'body',
    });
  }

  const slideId = 'reconstructed-slide-1';
  const n = Math.max(1, blocks.length);
  const availableHeight = 5.4;
  const fraction = Math.max(0.08, (availableHeight - (n - 1) * 0.3) / n / availableHeight);

  const slide = {
    id: slideId,
    kind: slideKind,
    title: slideTitle,
    blocks,
    layout: {
      schema: 'layout-ir',
      version: '1',
      width: 13.33,
      height: 7.5,
      direction: 'column',
      gap: 'md',
      padding: { top: 1.6, left: 0.8, right: 0.8, bottom: 0.6 },
      children: blocks.map((b, idx) => ({
        id: `block-${idx}`,
        kind: b.type,
        width: 1,
        height: fraction,
      })),
    },
  };

  const deckSpec = {
    schema: 'deck-spec',
    version: '1',
    title: slideTitle,
    author: 'PresentationOS Reference Reconstruction',
    slides: [slide],
  };

  const diff = computeReconstructionDiff(scene.elements, reconstructedElements);
  const metrics = calculateSceneMetrics(reconstructedElements);

  return {
    sceneIr: {
      ...scene,
      metrics,
    },
    deckSpec,
    editableCoverageRatio: metrics.editableCoverageRatio,
    diff,
  };
}
