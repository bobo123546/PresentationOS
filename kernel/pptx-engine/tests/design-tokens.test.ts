import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { resolveDeckScenes, renderDeck, type DeckSpec } from '../src/index.js';

const tokens = { schema: 'design-token', version: '1', colors: { primary: '#123456', secondary: '#654321',
  background: '#F1F5F9', text: '#102030', accent: '#2C4A70', surface: '#FFFFFF' }, fonts: { heading: 'Georgia', body: 'Arial' } };
const deck = (): DeckSpec => ({ title: 'Reference design', designTokens: structuredClone(tokens), slides: [
  { id: 'slide-1', kind: 'cover', title: 'Cover', blocks: [{ type: 'text', text: 'Budget -12.5, customers 10,000' }] },
  { id: 'slide-2', kind: 'content', title: 'Evidence', blocks: [{ type: 'table', headers: ['Metric', 'Value'], rows: [['Budget', '-12.5']] }] },
] });
const resolveRects = () => new Map();

test('canonical tokens drive the shared scene, heading/body fonts and actual PPTX XML', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-theme-'));
  try {
    const source = deck(), scenes = resolveDeckScenes(source, { resolveRects });
    assert.deepEqual(scenes.map(scene => scene.background.color), ['123456', 'F1F5F9']);
    assert.equal(scenes[0].commands.find(command => command.options.objectName === 'source-slide-1-title')!.options.fontFace, 'Georgia');
    assert.equal(scenes[0].commands.find(command => command.sourceBlockIndex === 0)!.options.fontFace, 'Arial');
    const table = scenes[1].commands.find(command => command.type === 'table')!;
    assert.equal((table.rows![0][0] as any).options.fill, '123456');
    const output = join(dir, 'theme.pptx');
    assert.equal((await renderDeck(source, { outPath: output, resolveRects })).verification.ok, true);
    const zip = await JSZip.loadAsync(readFileSync(output));
    const cover = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const content = await zip.file('ppt/slides/slide2.xml')!.async('string');
    assert.ok(cover.includes('val="123456"') && cover.includes('typeface="Georgia"') && cover.includes('typeface="Arial"'));
    assert.ok(content.includes('val="F1F5F9"') && content.includes('val="123456"'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('invalid tokens fail before output publication instead of silently using a preset', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-theme-invalid-'));
  try {
    for (const invalid of [{ ...tokens, version: '9' }, { ...tokens, colors: { ...tokens.colors, background: 'oops' } },
      { ...tokens, fonts: { heading: '', body: 'Arial' } }]) {
      const source = deck(); source.designTokens = invalid;
      const output = join(dir, 'invalid.pptx');
      await assert.rejects(() => renderDeck(source, { outPath: output, resolveRects }), /design|Design/);
      assert.equal(existsSync(output), false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
