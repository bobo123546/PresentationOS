import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createTaskService, inspectDeck, mdToDeck } from '../src/index.js';
const JSZip = createRequire(import.meta.resolve('@pres/pptx-engine'))('jszip');

test('a theme-only reference reaches actual generated slides and the source-bound QA report', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-reference-'));
  const service = createTaskService({ dbPath: join(dir, 'workflow.db') });
  try {
    const zip = new JSZip();
    zip.file('ppt/theme/theme1.xml', '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="brand"><a:dk1><a:srgbClr val="102030"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="123456"/></a:accent1><a:accent2><a:srgbClr val="345678"/></a:accent2></a:clrScheme><a:fontScheme name="brand"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>');
    const reference = join(dir, '参考模板.pptx'), bytes = await zip.generateAsync({ type: 'nodebuffer' });
    writeFileSync(reference, bytes);
    const out = join(dir, 'generated.pptx');
    const result = await service.compileMarkdown({ projectId: 'reference', markdown: '# Brand report\nBudget -12.5万元\n## Data\n| Value | Customers |\n| --- | --- |\n| -12.5 | 10,000 |', outPptxPath: out, referencePptxPath: reference });
    assert.equal(result.ok, true, result.error);
    const report = JSON.parse(readFileSync(result.reportPath!, 'utf8'));
    assert.equal(report.designProfile.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(report.designProfile.dna.slideCount, 0);
    assert.equal(report.designProfile.tokens.schema, 'design-token');
    assert.match(report.designProfile.scope, /layouts? |geometry/);
    assert.equal(report.contentVerification.ok, true);
    const generated = await JSZip.loadAsync(readFileSync(out));
    const actual = await generated.file('ppt/slides/slide1.xml').async('string');
    assert.ok(actual.includes('val="123456"'));
    assert.ok(actual.includes('typeface="Arial"'));
    assert.deepEqual(readFileSync(reference), bytes);
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('ambiguous design input and invalid canonical tokens fail before publication', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-reference-invalid-'));
  const service = createTaskService({ dbPath: join(dir, 'workflow.db') });
  try {
    for (const fields of [{ referencePptxPath: 'missing.pptx', designTokens: {} }, { designTokens: { colors: { text: 'red' } } }]) {
      const path = join(dir, 'never.pptx');
      const result = await service.compileMarkdown({ projectId: 'invalid', markdown: '# Input\nBody', outPptxPath: path, ...fields });
      assert.equal(result.ok, false);
      assert.equal(existsSync(path), false);
      assert.match(result.error!, /Choose|schema/);
    }
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('contrast checks use the actual token background instead of skipping an object value', () => {
  const deck = mdToDeck('# Report\nCover\n## Body\nReadable source');
  deck.designTokens = { schema: 'design-token', version: '1', colors: { primary: '#123456', secondary: '#345678',
    background: '#FFFFFF', surface: '#FFFFFF', text: '#FFFFFF' }, fonts: { heading: 'Arial', body: 'Arial' } };
  const qa = inspectDeck(deck);
  assert.ok(qa.visual.issues.some(issue => issue.rule === 'contrast' && issue.message.includes('FFFFFF/FFFFFF')));
  assert.equal(qa.passed, false);
});

test('unreadable body and table cell theme colors block workflow publication', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-design-contrast-'));
  const service = createTaskService({ dbPath: join(dir, 'workflow.db') });
  try {
    const result = await service.compileMarkdown({ projectId: 'contrast', markdown: '# Cover\nIntro\n## Table\n| A | B |\n| --- | --- |\n| 1 | -12.5 |', outPptxPath: join(dir, 'unreadable.pptx'),
      designTokens: { schema: 'design-token', version: '1', colors: { primary: '#FFFF00', secondary: '#345678', background: '#FFFFFF', text: '#FFFFFF', surface: '#FFFFFF' }, fonts: { heading: 'Arial', body: 'Arial' } } });
    assert.equal(result.ok, false); assert.equal(existsSync(join(dir, 'unreadable.pptx')), false);
    const report = JSON.parse(readFileSync(result.reportPath!, 'utf8'));
    assert.ok(report.visual.issues.some((issue: any) => issue.message.includes('Table cell') && issue.severity === 'error'));
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('revision budget zero disables changes and invalid budgets fail explicitly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-revision-budget-'));
  const service = createTaskService({ dbPath: join(dir, 'workflow.db') });
  try {
    const zero = await service.compileMarkdown({ projectId: 'zero', markdown: '# Report\nBody', outPptxPath: join(dir, 'zero.pptx'), maxRevisionRounds: 0 });
    assert.equal(zero.ok, true, zero.error); assert.deepEqual((zero.summary as any).rounds, []);
    for (const maxRevisionRounds of [-1, 11, 1.5, NaN]) {
      const invalid = await service.compileMarkdown({ projectId: 'invalid', markdown: '# Report\nBody', outPptxPath: join(dir, 'invalid.pptx'), maxRevisionRounds });
      assert.equal(invalid.ok, false); assert.match(invalid.error!, /maxRevisionRounds/);
      assert.equal(existsSync(join(dir, 'invalid.pptx')), false);
    }
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});
