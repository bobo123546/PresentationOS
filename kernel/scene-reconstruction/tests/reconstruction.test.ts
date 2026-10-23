import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAllSchemas, validate, SCHEMA_IDS } from '@pres/schema-validator';
import {
  SceneIR,
  reconstructDeckFromScene,
  computeReconstructionDiff,
  applyCorrectionPatches,
  calculateSceneMetrics,
  calculateIoU,
} from '../src/index.js';

test('TC-R01: SceneIR validates against JSON Schema Draft 2020-12', async () => {
  await loadAllSchemas();

  const mockScene: SceneIR = {
    version: '1.0.0',
    sourceType: 'screenshot',
    sourcePath: 'samples/dashboard.png',
    dimensions: { width: 1920, height: 1080 },
    palette: {
      dominantHex: '0F172A',
      backgroundHex: 'F8FAFC',
      accentHex: '2563EB',
      textHex: '1E293B',
    },
    elements: [
      {
        id: 'el-title',
        type: 'heading',
        bounds: { x: 0.1, y: 0.1, w: 0.8, h: 0.1 },
        text: 'Q3 Enterprise Performance Summary',
        confidence: 0.98,
        isEditable: true,
      },
      {
        id: 'el-metric-1',
        type: 'metric',
        bounds: { x: 0.1, y: 0.25, w: 0.35, h: 0.2 },
        text: 'Total Revenue: 5000万元 (+24% YoY)',
        confidence: 0.95,
        isEditable: true,
      },
      {
        id: 'el-table-1',
        type: 'table',
        bounds: { x: 0.1, y: 0.5, w: 0.8, h: 0.35 },
        tableData: [
          ['Region', 'Q2 Actual', 'Q3 Target', 'Q3 Actual'],
          ['North', '1200万', '1400万', '1520万'],
          ['South', '1800万', '2000万', '2150万'],
        ],
        confidence: 0.92,
        isEditable: true,
      },
      {
        id: 'el-raster-1',
        type: 'raster_graphic',
        bounds: { x: 0.5, y: 0.25, w: 0.4, h: 0.2 },
        confidence: 0.65,
        isEditable: false,
      },
    ],
    metrics: {
      totalElements: 4,
      editableCount: 3,
      editableCoverageRatio: 0.75,
      averageConfidence: 0.875,
      uncertainCount: 1,
    },
  };

  const valResult = validate(SCHEMA_IDS.sceneIr, mockScene);
  assert.equal(valResult.valid, true, `Validation failed: ${valResult.errors.join(', ')}`);
});

test('TC-R02: Reconstructs editable DeckSpec from SceneIR without full-page bitmap hack', () => {
  const scene: SceneIR = {
    version: '1.0.0',
    sourceType: 'screenshot',
    dimensions: { width: 1920, height: 1080 },
    elements: [
      {
        id: 'h1',
        type: 'heading',
        bounds: { x: 0.1, y: 0.05, w: 0.8, h: 0.1 },
        text: 'Annual Strategy Review',
        confidence: 0.99,
        isEditable: true,
      },
      {
        id: 'm1',
        type: 'metric',
        bounds: { x: 0.1, y: 0.2, w: 0.4, h: 0.15 },
        text: 'Customer Retention: 98.4%',
        confidence: 0.94,
        isEditable: true,
      },
      {
        id: 'p1',
        type: 'paragraph',
        bounds: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 },
        text: 'Strategic initiatives have achieved breakthrough delivery across key cloud regions.',
        confidence: 0.91,
        isEditable: true,
      },
      {
        id: 't1',
        type: 'table',
        bounds: { x: 0.1, y: 0.65, w: 0.8, h: 0.25 },
        tableData: [
          ['Milestone', 'Date', 'Status'],
          ['Alpha Release', '2026-10-22', 'Completed'],
          ['GA Launch', '2026-11-15', 'On Track'],
        ],
        confidence: 0.88,
        isEditable: true,
      },
      {
        id: 'r1',
        type: 'raster_graphic',
        bounds: { x: 0.6, y: 0.2, w: 0.3, h: 0.15 },
        confidence: 0.6,
        isEditable: false,
      },
    ],
    metrics: {
      totalElements: 5,
      editableCount: 4,
      editableCoverageRatio: 0.8,
      averageConfidence: 0.864,
      uncertainCount: 1,
    },
  };

  const res = reconstructDeckFromScene(scene);

  assert.equal(res.deckSpec.schema, 'deck-spec');
  assert.equal(res.deckSpec.title, 'Annual Strategy Review');
  assert.equal(res.deckSpec.slides.length, 1);

  const slide = res.deckSpec.slides[0];
  assert.equal(slide.title, 'Annual Strategy Review');

  // Verify all 3 non-heading editable blocks are real presentation blocks
  const blockTypes = slide.blocks.map((b: any) => b.type);
  assert.ok(blockTypes.includes('text'));
  assert.ok(blockTypes.includes('table'));

  // Ensure table has proper headers and rows
  const tableBlock = slide.blocks.find((b: any) => b.type === 'table');
  assert.ok(tableBlock);
  assert.deepEqual(tableBlock.headers, ['Milestone', 'Date', 'Status']);
  assert.equal(tableBlock.rows.length, 2);

  // Editable coverage report should correctly reflect 4/5 editable elements
  assert.equal(res.editableCoverageRatio, 0.8);
});

test('TC-R03: Diff calculation detects IoU overlap and text fidelity', () => {
  const orig = [
    {
      id: 'e1',
      type: 'heading' as const,
      bounds: { x: 0.1, y: 0.1, w: 0.8, h: 0.1 },
      text: 'Original Title',
      confidence: 0.95,
      isEditable: true,
    },
  ];
  const recon = [
    {
      id: 'e1',
      type: 'heading' as const,
      bounds: { x: 0.1, y: 0.1, w: 0.8, h: 0.1 },
      text: 'Original Title',
      confidence: 0.95,
      isEditable: true,
    },
  ];

  const diff = computeReconstructionDiff(orig, recon);
  assert.equal(diff.totalCompared, 1);
  assert.equal(diff.matchedCount, 1);
  assert.equal(diff.averageIoU, 1.0);
  assert.equal(diff.textPreservationRate, 1.0);
  assert.equal(diff.diffItems[0].textMatch, true);
});

test('TC-R04: Human correction patch replays cleanly and preserves auditability', () => {
  const scene: SceneIR = {
    version: '1.0.0',
    sourceType: 'screenshot',
    dimensions: { width: 1920, height: 1080 },
    elements: [
      {
        id: 'metric-kpi',
        type: 'metric',
        bounds: { x: 0.1, y: 0.2, w: 0.4, h: 0.2 },
        text: 'Revenue 500000', // Missing unit or unclear OCR
        confidence: 0.65,
        isEditable: true,
      },
    ],
    metrics: {
      totalElements: 1,
      editableCount: 1,
      editableCoverageRatio: 1.0,
      averageConfidence: 0.65,
      uncertainCount: 1,
    },
  };

  // User submits correction patch
  const corrected = applyCorrectionPatches(scene, [
    {
      elementId: 'metric-kpi',
      action: 'update_text',
      newText: 'Revenue: 5000万元',
    },
  ]);

  assert.equal(corrected.elements[0].text, 'Revenue: 5000万元');
  // Verified text receives 1.0 confidence
  assert.equal(corrected.elements[0].confidence, 1.0);
  assert.equal(corrected.metrics.uncertainCount, 0);
  assert.equal(corrected.metrics.averageConfidence, 1.0);
});
