import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readRenderedDeck } from '@pres/pptx-engine';
import { createTaskService, documentToDeck } from '../src/index.js';
import { splitTextForSlides, mdToDeck } from '../src/deck-pipeline.js';
const JSZip = createRequire(import.meta.resolve('@pres/pptx-engine'))('jszip');

test('DOCX body/table order and negative quantities reach the actual PPTX through the workflow', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-docx-compile-'));
  const service = createTaskService({ dbPath: join(dir, 'workflow.db') });
  try {
    const zip = new JSZip(), paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
    zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph('Before -12.5万元')}<w:tbl><w:tr><w:tc>${paragraph('指标')}</w:tc><w:tc>${paragraph('值')}</w:tc></w:tr><w:tr><w:tc>${paragraph('客户')}</w:tc><w:tc>${paragraph('10,000家')}</w:tc></w:tr></w:tbl>${paragraph('After -5%')}</w:body></w:document>`);
    const bytes = await zip.generateAsync({ type: 'nodebuffer', streamFiles: true }), source = join(dir, 'source.docx');
    writeFileSync(source, bytes);
    const result = await service.compileDocumentFile({ projectId: 'docx', inputPath: source, outPptxPath: join(dir, 'output.pptx') });
    assert.equal(result.ok, true, result.error);
    const actual = await readRenderedDeck(readFileSync(result.pptxPath!));
    assert.equal(actual[0].objects.find(object => object.name === 'source-slide-1-title')!.text, 'source');
    const content = actual.flatMap(slide => slide.objects.filter(object => object.name.startsWith('source-') && !object.name.endsWith('-title')))
      .flatMap(object => object.type === 'table' ? object.rows!.flat() : [object.text ?? '']);
    assert.deepEqual(content, ['Before -12.5万元', '指标', '值', '客户', '10,000家', 'After -5%']);
    assert.equal((result.summary as any).sourceProfile.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal((result.summary as any).sourceProfile.format, 'docx');
    assert.deepEqual(readFileSync(source), bytes);
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('CSV import paginates all rows, retaining exact cells and repeated headers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-csv-compile-'));
  const service = createTaskService({ dbPath: join(dir, 'workflow.db') });
  try {
    const source = join(dir, 'source.csv');
    const rows = Array.from({ length: 19 }, (_, i) => [`项目${i + 1}`, i === 18 ? '-12.5万元' : `${i},000`]);
    writeFileSync(source, '项目,数值\n' + rows.map(row => `${row[0]},"${row[1]}"`).join('\n'));
    const result = await service.compileDocumentFile({ projectId: 'csv', inputPath: source, outPptxPath: join(dir, 'output.pptx') });
    assert.equal(result.ok, true, result.error);
    const actual = await readRenderedDeck(readFileSync(result.pptxPath!));
    const tables = actual.flatMap(slide => slide.objects).filter(object => object.type === 'table');
    assert.equal(tables.length, 3); assert.deepEqual(tables.flatMap(table => table.rows!.slice(1)), rows);
    assert.ok(tables.every(table => table.rows![0].join('/') === '项目/数值'));
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('unsupported documents/assets fail explicitly rather than reporting content preservation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-document-unsupported-'));
  const service = createTaskService({ dbPath: join(dir, 'workflow.db') });
  try {
    const source = join(dir, 'input.pdf'); writeFileSync(source, '%PDF-1.7\nThis is not extracted text.');
    const result = await service.compileDocumentFile({ projectId: 'pdf', inputPath: source, outPptxPath: join(dir, 'output.pptx') });
    assert.equal(result.ok, false); assert.equal(result.sourceContentPreserved, false); assert.equal(existsSync(join(dir, 'output.pptx')), false);
    assert.match(result.error!, /Unsupported|unsupported/);
    assert.throws(() => documentToDeck({ schema: 'document-ir', version: '1', source: 'x', sourceType: 'markdown', blocks: [{ type: 'image', src: 'https://example.com/private.png', caption: 'Image' }] }, 'x'), /asset adapter/);
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('pagination preserves complete quantities and graphemes at capacity boundaries', () => {
  for (const literal of ['-12.5万元', '10,000家', '-5%', '2026-10-24']) {
    const text = '中'.repeat(698) + literal;
    const parts = splitTextForSlides(text);
    assert.equal(parts.join(''), text); assert.ok(parts.some(part => part.includes(literal)));
    const deck = mdToDeck('# Source\n' + text);
    assert.ok(deck.slides.flatMap(slide => slide.blocks).some(block => block.text?.includes(literal)));
  }
  assert.ok(splitTextForSlides('A'.repeat(698) + '-12.5万元').some(part => part.includes('-12.5万元')));
  const text = '中'.repeat(699) + '👩🏽‍💻' + 'e\u0301'.repeat(2);
  assert.equal(splitTextForSlides(text).join(''), text);
  assert.ok(splitTextForSlides(text)[0].endsWith('👩🏽‍💻'));
  assert.throws(() => splitTextForSlides('A'.repeat(701)), /indivisible/);
});
