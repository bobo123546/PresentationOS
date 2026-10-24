import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyRevisions } from '@pres/revision-engine';
import { renderDeck, verifyRenderedDeck, resolveLayout, type DeckSpec } from '@pres/pptx-engine';
import { ensureSchemas, markdownSections, mdToDeck, layoutFor } from '../src/deck-pipeline.js';
import { compileSourceSections, buildCompiledPageMap, validateCompiledPageMap, resolveSourceRef, verifySourceTraceReadback, sourceHash } from '../src/source-trace.js';
import { createTaskService } from '../src/task-service.js';

before(ensureSchemas);
function source(md: string) {
  const parsed = markdownSections(md, 'fallback');
  return compileSourceSections(parsed.title, parsed.sections, { bytes: Buffer.from(md), extractedText: md, format: 'markdown' });
}

test('tracked Markdown adapter preserves the existing deck and scopes IDs to byte snapshots', () => {
  const md = '# 来源\n收入100万元，成本50万元。\n## 继续\n- B部门100万元。';
  const compiled = source(md), other = source(md + '\n来源不同');
  assert.deepEqual(compiled.deck, mdToDeck(md, 'fallback'));
  assert.equal(compiled.trace.ledger.sourceBytesSha256, sourceHash(Buffer.from(md)));
  assert.equal(compiled.trace.ledger.extractedTextSha256, sourceHash(md));
  assert.notEqual(compiled.trace.ledger.sourceId, other.trace.ledger.sourceId);
  assert.equal(new Set(compiled.trace.ledger.facts.map(f => f.factId)).size, 3);
  assert.ok(compiled.trace.ledger.facts.every(f => f.evidenceStatus === 'EXTRACTED'));
  const map = buildCompiledPageMap(compiled.deck, compiled.trace);
  assert.equal(map.semanticTruth, 'NOT_VERIFIED');
  assert.equal(map.readback.status, 'NOT_ATTEMPTED');
});

test('swapped quantities, removed negation and same-value omission fail exact quotation binding', () => {
  for (const [md, changed] of [
    ['# 财务\n收入100万元，成本50万元。', '收入50万元，成本100万元。'],
    ['# 指标\n未达到10%。', '达到10%。'],
  ]) {
    const compiled = source(md); compiled.deck.slides[0].blocks[0].text = changed;
    assert.throws(() => buildCompiledPageMap(compiled.deck, compiled.trace), /SOURCE_QUOTATION_CHANGED/);
  }
  const repeated = source('# 同值\nA部门100万元。\nB部门100万元。');
  assert.equal(repeated.trace.ledger.facts.length, 2);
  assert.notEqual(repeated.trace.ledger.facts[0].factId, repeated.trace.ledger.facts[1].factId);
  repeated.deck.slides[0].blocks.pop();
  assert.throws(() => buildCompiledPageMap(repeated.deck, repeated.trace), /PROTECTED_CONTENT_OMITTED/);
});

test('UTF-16 occurrence ranges preserve emoji and complete context', () => {
  const compiled = source('# 测量\n公司👩🏽‍💻收入-12.5万元，客户10,000家，增长-5%。');
  const ledger = compiled.trace.ledger;
  for (const fact of ledger.facts) {
    assert.equal(resolveSourceRef(ledger, fact.ref), fact.literalValue);
    assert.equal(fact.ref.range.unit, 'utf16-code-unit');
    assert.equal(fact.sourceQuote, '公司👩🏽‍💻收入-12.5万元，客户10,000家，增长-5%。');
  }
  assert.equal(ledger.facts[0].ref.range.start, '公司👩🏽‍💻收入'.length);
  const ref = structuredClone(ledger.facts[0].ref); ref.range.start = 3; ref.range.end = 4;
  assert.throws(() => resolveSourceRef(ledger, ref), /SOURCE_RANGE_MISMATCH/);
});

test('long quotation pagination keeps exact ranges, occurrences and final object names', () => {
  const text = '中'.repeat(698) + '-12.5万元' + '文'.repeat(901) + ' 10,000家';
  const compiled = source('# 长来源\n' + text);
  const map = buildCompiledPageMap(compiled.deck, compiled.trace);
  assert.ok(map.pages.length >= 3);
  const quotes = map.pages.flatMap(page => page.objects.filter(object => !object.objectName.endsWith('-title')).flatMap(object => object.quotations));
  assert.equal(quotes.map(quote => quote.text).join(''), text);
  assert.equal(new Set(quotes.map(quote => quote.ref.chunkId)).size, 1);
  assert.deepEqual(map.pages.map(page => page.fragmentIndex), map.pages.map((_, i) => i));
  for (const page of map.pages) assert.ok(page.objects.every(object => object.objectName.startsWith(`source-${page.slideId}-`) && object.commandIds.length > 0));
});

test('layout revision split maps new slide IDs in final page order without duplicating content', () => {
  const compiled = source('# 主体\nA100万元。\nB50万元。\nC20万元。\nD10万元。');
  const revised = applyRevisions(compiled.deck, [{ slide: 1, action: 'split', reason: 'Bounded layout revision' }]).deck as DeckSpec;
  for (const slide of revised.slides) slide.layout = layoutFor(slide);
  const map = buildCompiledPageMap(revised, compiled.trace);
  assert.equal(map.pages.length, 2);
  assert.deepEqual(map.pages.map(page => page.page), [1, 2]);
  assert.deepEqual(map.pages.map(page => page.fragmentIndex), [0, 1]);
  assert.equal(map.pages[1].slideId, 'slide-2');
  assert.deepEqual(map.pages.flatMap(page => page.objects.filter(object => !object.objectName.endsWith('-title')).flatMap(object => object.quotations.map(quote => quote.text))), ['A100万元。', 'B50万元。', 'C20万元。', 'D10万元。']);
});

test('table chunks retain original row/column context through repeated-header pagination', () => {
  const rows = Array.from({ length: 10 }, (_, i) => `|主体${i}|${i === 8 ? '' : '100万元'}|`);
  const compiled = source('# 表\n|主体|金额|\n|---|---|\n' + rows.join('\n'));
  const map = buildCompiledPageMap(compiled.deck, compiled.trace);
  assert.equal(map.pages.length, 2);
  const value = compiled.trace.ledger.chunks.find(chunk => chunk.selector.row === 10 && chunk.selector.column === 1)!;
  assert.equal(value.context!.rowHeader, '主体9'); assert.equal(value.context!.columnHeader, '金额');
  const object = map.pages[1].objects.find(object => object.quotations.some(quote => quote.cell))!;
  assert.equal(object.quotations.find(quote => quote.cell?.row === 1 && quote.cell.column === 1)!.ref.selector.row, 9);
  validateCompiledPageMap(compiled.trace.ledger, map);
  const swapped = structuredClone(map), table = swapped.pages[0].objects.find(object => object.quotations.some(quote => quote.cell))!;
  const first = table.quotations[2].cell!, second = table.quotations[4].cell!;
  [first.row, second.row] = [second.row, first.row];
  assert.throws(() => validateCompiledPageMap(compiled.trace.ledger, swapped), /TABLE_CONTEXT_CHANGED/);
});

test('invalid references, altered source hashes, fact IDs and missing occurrence records are rejected', () => {
  const compiled = source('# 真实性范围\n甲100万元，乙100万元。');
  const map = buildCompiledPageMap(compiled.deck, compiled.trace);
  const bad = structuredClone(map), object = bad.pages[0].objects[1];
  object.quotations[0].ref.chunkId = 'chunk-' + '0'.repeat(32); object.sourceRefs = object.quotations.map(quote => quote.ref);
  assert.throws(() => validateCompiledPageMap(compiled.trace.ledger, bad), /SOURCE_REF_MISSING/);
  const wrongFact = structuredClone(map); wrongFact.pages[0].objects[1].factIds.pop();
  assert.throws(() => validateCompiledPageMap(compiled.trace.ledger, wrongFact), /FACT_BINDING_MISMATCH/);
  const missingFact = structuredClone(compiled.trace.ledger); missingFact.facts.pop();
  const missingMap = structuredClone(map); missingMap.sourceLedgerSha256 = sourceHash(JSON.stringify(missingFact));
  assert.throws(() => validateCompiledPageMap(missingFact, missingMap), /PROTECTED_OCCURRENCE_OMITTED/);
  const changed = structuredClone(compiled.trace.ledger); changed.chunks[1].text = '甲50万元，乙100万元。';
  assert.throws(() => validateCompiledPageMap(changed, map), /SOURCE_HASH_CHANGED/);
});

test('actual PPTX swapped values cannot pass source-map readback even when deck-only readback passes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-source-readback-'));
  try {
    const compiled = source('# 财务\n收入100万元，成本50万元。');
    const map = buildCompiledPageMap(compiled.deck, compiled.trace);
    const altered = structuredClone(compiled.deck); altered.slides[0].blocks[0].text = '收入50万元，成本100万元。';
    const path = join(dir, 'altered.pptx');
    await renderDeck(altered, { outPath: path, resolveRects: slide => resolveLayout(slide.layout ?? layoutFor(slide)) });
    const actual = await verifyRenderedDeck(path, altered);
    assert.equal(actual.ok, true);
    assert.throws(() => verifySourceTraceReadback(compiled.trace.ledger, map, actual), /SOURCE_READBACK_FAILED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('both workflow entry points publish strict readback-bound ledger and page map', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-source-workflow-')), service = createTaskService({ dbPath: join(dir, 'workflow.db') });
  try {
    const markdown = '# 绑定\n公司👩🏽‍💻收入100万元。\n|主体|金额|\n|---|---|\n|成本|-50万元|';
    const md = await service.compileMarkdown({ projectId: 'md', markdown, outPptxPath: join(dir, 'md.pptx') });
    assert.equal(md.ok, true, md.error);
    const csv = '主体,金额\n收入,100万元\n成本,-50万元';
    const inputPath = join(dir, 'source.csv'); writeFileSync(inputPath, csv);
    const doc = await service.compileDocumentFile({ projectId: 'csv', inputPath, outPptxPath: join(dir, 'csv.pptx'), sourceAssetSha256: sourceHash(csv) });
    assert.equal(doc.ok, true, doc.error);
    for (const result of [md, doc]) {
      const report = JSON.parse(readFileSync(result.reportPath!, 'utf8'));
      validateCompiledPageMap(report.sourceLedger, report.compiledPageMap);
      assert.equal(report.compiledPageMap.readback.status, 'PASS');
      assert.equal(report.compiledPageMap.readback.artifactSha256, sourceHash(readFileSync(result.pptxPath!)));
      assert.equal(report.compiledPageMap.semanticTruth, 'NOT_VERIFIED');
    }
    const changed = await service.compileDocumentFile({ projectId: 'changed', inputPath, sourceAssetSha256: '0'.repeat(64), outPptxPath: join(dir, 'changed.pptx') });
    assert.equal(changed.ok, false); assert.match(changed.error!, /SOURCE_HASH_CHANGED/);
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('same-chunk page fragments cannot be swapped or overlapped with complete aggregate coverage', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-source-order-'));
  try {
    const compiled = source('# 顺序\n' + '甲'.repeat(700) + '乙'.repeat(700));
    const map = buildCompiledPageMap(compiled.deck, compiled.trace), changed = structuredClone(map);
    const a = changed.pages[0].objects[1], b = changed.pages[1].objects[1];
    [a.quotations, b.quotations] = [b.quotations, a.quotations];
    [a.sourceRefs, b.sourceRefs] = [b.sourceRefs, a.sourceRefs];
    [a.factIds, b.factIds] = [b.factIds, a.factIds];
    [a.visibleContentSha256, b.visibleContentSha256] = [b.visibleContentSha256, a.visibleContentSha256];
    assert.throws(() => validateCompiledPageMap(compiled.trace.ledger, changed), /SOURCE_ORDER_CHANGED/);
    const altered = structuredClone(compiled.deck);
    [altered.slides[0].blocks, altered.slides[1].blocks] = [altered.slides[1].blocks, altered.slides[0].blocks];
    const path = join(dir, 'swapped.pptx');
    await renderDeck(altered, { outPath: path, resolveRects: slide => resolveLayout(slide.layout ?? layoutFor(slide)) });
    const actual = await verifyRenderedDeck(path, altered); assert.equal(actual.ok, true);
    assert.throws(() => verifySourceTraceReadback(compiled.trace.ledger, changed, actual), /SOURCE_ORDER_CHANGED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('actual unbound table rows and title suffixes fail the complete visible-object fingerprint', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-source-unbound-'));
  try {
    const compiled = source('# 原始\n|主体|金额|\n|---|---|\n|收入|100万元|');
    const map = buildCompiledPageMap(compiled.deck, compiled.trace);
    for (const mutation of ['row', 'title']) {
      const altered = structuredClone(compiled.deck);
      if (mutation === 'row') altered.slides[0].blocks[0].rows!.push(['无来源新增', '999万元']);
      else altered.slides[0].title += ' 未经来源支持的新标题';
      const path = join(dir, mutation + '.pptx');
      await renderDeck(altered, { outPath: path, resolveRects: slide => resolveLayout(slide.layout ?? layoutFor(slide)) });
      const actual = await verifyRenderedDeck(path, altered); assert.equal(actual.ok, true);
      assert.throws(() => verifySourceTraceReadback(compiled.trace.ledger, map, actual), /SOURCE_READBACK_FAILED/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CSV quoted CRLF cells use declared paragraph newline normalization while spaces remain exact', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-source-newlines-')), service = createTaskService({ dbPath: join(dir, 'workflow.db') });
  try {
    const csv = '指标,说明\r\n收入,"第一行\r\n第二行  空格"\r\n成本,"  100万元  "';
    const inputPath = join(dir, 'source.csv'); writeFileSync(inputPath, csv);
    const result = await service.compileDocumentFile({ projectId: 'csv', inputPath, outPptxPath: join(dir, 'csv.pptx') });
    assert.equal(result.ok, true, result.error);
    const report = JSON.parse(readFileSync(result.reportPath!, 'utf8'));
    assert.equal(report.compiledPageMap.readback.textNormalization, 'crlf-and-cr-to-lf-only');
    assert.ok(report.sourceLedger.chunks.some((chunk: any) => chunk.text === '第一行\r\n第二行  空格'));
    const original = report.contentVerification;
    assert.equal(original.ok, true);
    const table = original.slides[0].objects.find((object: any) => object.type === 'table');
    table.rows[1][1] = table.rows[1][1].replace('  ', ' ');
    assert.throws(() => verifySourceTraceReadback(report.sourceLedger, report.compiledPageMap, original), /SOURCE_READBACK_FAILED/);
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('uploaded Markdown compiles through the same parser as direct content, retaining ordinary and escaped pipes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-source-md-file-')), service = createTaskService({ dbPath: join(dir, 'workflow.db') });
  try {
    const markdown = '# 一致\n管道命令 A | B 仍是正文，预算100万元。\n|字段|含义|\n|---|---|\n|A\\|B|保留50万元|';
    const inputPath = join(dir, 'upload.md'); writeFileSync(inputPath, markdown);
    const direct = await service.compileMarkdown({ projectId: 'direct', markdown, outPptxPath: join(dir, 'direct.pptx') });
    const uploaded = await service.compileDocumentFile({ projectId: 'uploaded', inputPath, outPptxPath: join(dir, 'uploaded.pptx') });
    assert.equal(direct.ok, true, direct.error); assert.equal(uploaded.ok, true, uploaded.error);
    const a = JSON.parse(readFileSync(direct.reportPath!, 'utf8')), b = JSON.parse(readFileSync(uploaded.reportPath!, 'utf8'));
    assert.deepEqual(a.sourceLedger, b.sourceLedger);
    assert.deepEqual(a.contentVerification.slides.map((slide: any) => slide.objects), b.contentVerification.slides.map((slide: any) => slide.objects));
    assert.ok(b.sourceLedger.chunks.some((chunk: any) => chunk.text === '管道命令 A | B 仍是正文，预算100万元。'));
    assert.ok(b.sourceLedger.chunks.some((chunk: any) => chunk.text === 'A|B'));
  } finally { service.close(); rmSync(dir, { recursive: true, force: true }); }
});
