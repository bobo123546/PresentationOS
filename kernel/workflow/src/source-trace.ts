import { createHash } from 'node:crypto';
import { extractFacts } from '@pres/document-parser';
import { resolveDeckScenes, resolveLayout, type DeckSpec, type SlideBlock, type RenderedDeckVerification } from '@pres/pptx-engine';
import { validate } from '@pres/schema-validator';
import { layoutFor, paginateSections, type SourceSection, type SourceSelector } from './deck-pipeline.js';

const LEDGER_SCHEMA = 'https://presentationos.local/schemas/source-ledger/1';
const MAP_SCHEMA = 'https://presentationos.local/schemas/compiled-page-map/1';
export const sourceHash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

export interface SourceRef {
  sourceId: string;
  chunkId: string;
  textSha256: string;
  range: { unit: 'utf16-code-unit'; start: number; end: number };
  selector: SourceSelector;
}
export interface SourceChunk {
  chunkId: string;
  role: 'title' | 'text' | 'table-cell';
  text: string;
  textSha256: string;
  selector: SourceSelector;
  context?: { tableId: string; row: number; column: number; rowHeader: string; columnHeader: string };
}
export interface SourceFact {
  factId: string;
  ref: SourceRef;
  literalValue: string;
  kind: 'numeric' | 'currency' | 'percentage' | 'date' | 'unit';
  sourceQuote: string;
  evidenceStatus: 'EXTRACTED';
}
export interface SourceLedger {
  schema: 'source-ledger';
  version: '1';
  sourceId: string;
  sourceBytesSha256: string;
  extractedTextSha256: string;
  format: string;
  extractor: { id: string; version: string };
  coordinateSystem: 'zero-based-selector-and-utf16-code-unit-range';
  contentMode: 'preserve-all-source-order-quotation';
  scope: string;
  chunks: SourceChunk[];
  facts: SourceFact[];
}
interface Quotation { ref: SourceRef; text: string; cell?: { row: number; column: number } }
interface DraftBlock { expected: SlideBlock; quotations: Quotation[] }
interface DraftPage {
  initialSlideId: string;
  planSlideId: string;
  title: string;
  titleRef?: SourceRef;
  blocks: DraftBlock[];
}
export interface SourceTraceDraft { ledger: SourceLedger; pages: DraftPage[] }
export interface MappedObject {
  objectName: string;
  commandIds: string[];
  derivedObjectNames: string[];
  sourceRefs: SourceRef[];
  factIds: string[];
  quotations: Quotation[];
  generated: boolean;
  visibleContentSha256: string;
  generatedText?: string;
  titleSuffix?: string;
}
export interface CompiledPageMap {
  schema: 'compiled-page-map';
  version: '1';
  sourceLedgerSha256: string;
  deckContentSha256: string;
  bindingScope: 'exact-source-quotations-and-table-cell-context';
  semanticTruth: 'NOT_VERIFIED';
  pages: Array<{ page: number; slideId: string; planSlideId: string; fragmentIndex: number; objects: MappedObject[] }>;
  integrity: { sourceReferences: 'PASS'; protectedOccurrences: 'PASS'; quotationCoverage: 'PASS'; tableContext: 'PASS'; paraphrase: 'NOT_ALLOWED' };
  readback: { status: 'NOT_ATTEMPTED' | 'PASS'; scope: 'exact-text-and-cell-object-binding'; textNormalization: 'crlf-and-cr-to-lf-only'; artifactSha256?: string };
}

function fail(code: string, locator: string): never { throw new Error(`${code}: ${locator}`); }
function validateSchema(id: string, value: unknown): void {
  const result = validate(id, value);
  if (!result.valid) fail('SOURCE_TRACE_SCHEMA_INVALID', result.errors.join('; '));
}
function content(block: SlideBlock): SlideBlock {
  const { fontScale, color, ...rest } = block;
  return rest;
}
function refFor(ledger: SourceLedger, chunk: SourceChunk, start = 0, end = chunk.text.length): SourceRef {
  return { sourceId: ledger.sourceId, chunkId: chunk.chunkId, textSha256: chunk.textSha256,
    range: { unit: 'utf16-code-unit', start, end }, selector: { ...chunk.selector } };
}
function resolveRef(ledger: SourceLedger, ref: SourceRef, index?: Map<string, SourceChunk>): string {
  if (ref.sourceId !== ledger.sourceId) fail('SOURCE_HASH_CHANGED', ref.chunkId);
  const chunk = index ? index.get(ref.chunkId) : ledger.chunks.find(item => item.chunkId === ref.chunkId);
  if (!chunk) fail('SOURCE_REF_MISSING', ref.chunkId);
  if (sourceHash(chunk.text) !== chunk.textSha256 || ref.textSha256 !== chunk.textSha256) fail('SOURCE_HASH_CHANGED', ref.chunkId);
  if (JSON.stringify(ref.selector) !== JSON.stringify(chunk.selector)) fail('SOURCE_RANGE_MISMATCH', ref.chunkId);
  const range = ref.range;
  if (range.unit !== 'utf16-code-unit' || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start || range.end > chunk.text.length) fail('SOURCE_RANGE_MISMATCH', ref.chunkId);
  // A UTF-16 coordinate may not bisect a surrogate pair.
  for (const offset of [range.start, range.end]) if (offset > 0 && offset < chunk.text.length && /[\uD800-\uDBFF]/.test(chunk.text[offset - 1]) && /[\uDC00-\uDFFF]/.test(chunk.text[offset])) fail('SOURCE_RANGE_MISMATCH', ref.chunkId);
  return chunk.text.slice(range.start, range.end);
}
export function resolveSourceRef(ledger: SourceLedger, ref: SourceRef): string { return resolveRef(ledger, ref); }

/** Creates immutable source occurrences while retaining the existing deterministic pagination. */
export function compileSourceSections(title: string, sections: SourceSection[], source: { bytes: Buffer; extractedText: string; format: string }): { deck: DeckSpec; trace: SourceTraceDraft } {
  const sha = sourceHash(source.bytes);
  const ledger: SourceLedger = {
    schema: 'source-ledger', version: '1', sourceId: `source-${sha}`, sourceBytesSha256: sha,
    extractedTextSha256: sourceHash(source.extractedText), format: source.format,
    extractor: { id: 'presentationos-source-order-adapter', version: '1' }, coordinateSystem: 'zero-based-selector-and-utf16-code-unit-range',
    contentMode: 'preserve-all-source-order-quotation',
    scope: 'All supported presentation text and table cells in source order. Blank formatting and Markdown syntax are not visible content. Document-IR selectors identify extracted blocks, not physical OOXML offsets. Extraction and exact quotation do not certify factual truth.',
    chunks: [], facts: [],
  };
  const chunkIndex = new Map<string, SourceChunk>();
  const add = (text: string, selector: SourceSelector, role: SourceChunk['role'], context?: SourceChunk['context']): SourceChunk => {
    const chunkId = `chunk-${sourceHash(`${ledger.sourceId}\n${JSON.stringify(selector)}`).slice(0, 32)}`;
    if (chunkIndex.has(chunkId)) fail('SOURCE_SELECTOR_COLLISION', chunkId);
    const chunk: SourceChunk = { chunkId, role, text, textSha256: sourceHash(text), selector, ...(context ? { context } : {}) };
    ledger.chunks.push(chunk); chunkIndex.set(chunkId, chunk);
    for (const fact of extractFacts(text)) {
      const [start, end] = fact.charRange!;
      ledger.facts.push({ factId: `fact-${sourceHash(`${ledger.sourceId}\n${chunkId}\n${start}:${end}`).slice(0, 32)}`,
        ref: refFor(ledger, chunk, start, end), literalValue: fact.literalValue, kind: fact.factType, sourceQuote: text, evidenceStatus: 'EXTRACTED' });
    }
    return chunk;
  };
  const sourceSections = sections.map((section, sectionIndex) => ({
    title: section.titleSelector ? add(section.title, section.titleSelector, 'title') : undefined,
    blocks: section.blocks.map((block, blockIndex) => {
      const selector = section.blockSelectors?.[blockIndex];
      if (!selector) fail('SOURCE_REF_MISSING', `section-${sectionIndex}/block-${blockIndex}`);
      if (block.type === 'text') return { text: add(block.text, selector, 'text'), cells: [] as SourceChunk[][] };
      if (block.type !== 'table') fail('SOURCE_TYPE_UNSUPPORTED', block.type);
      const tableId = `table-${sourceHash(JSON.stringify(selector)).slice(0, 16)}`;
      return { text: undefined, cells: [block.headers, ...block.rows].map((row: string[], rowIndex: number) => row.map((value, column) => add(value,
        { ...selector, row: rowIndex, column }, 'table-cell', { tableId, row: rowIndex, column, rowHeader: row[0] ?? '', columnHeader: block.headers[column] ?? '' }))) };
    }),
  }));
  const { deck, origins } = paginateSections(title, sections);
  const pages: DraftPage[] = deck.slides.map((slide, index) => {
    const origin = origins[index], section = sourceSections[origin.sectionIndex];
    return { initialSlideId: slide.id, planSlideId: `source-section-${origin.sectionIndex + 1}`, title: sections[origin.sectionIndex].title,
      ...(section.title ? { titleRef: refFor(ledger, section.title) } : {}),
      blocks: origin.blocks.map((blockOrigin, i) => {
        const original = section.blocks[blockOrigin.blockIndex];
        const quotations: Quotation[] = original.text
          ? [{ ref: refFor(ledger, original.text, ...blockOrigin.textRange!), text: slide.blocks[i].text! }]
          : [original.cells[0], ...original.cells.slice(blockOrigin.rowRange![0] + 1, blockOrigin.rowRange![1] + 1)]
            .flatMap((row, rowIndex) => row.map((cell, column) => ({ ref: refFor(ledger, cell), text: cell.text, cell: { row: rowIndex, column } })));
        return { expected: content(slide.blocks[i]), quotations };
      }) };
  });
  validateSchema(LEDGER_SCHEMA, ledger);
  return { deck, trace: { ledger, pages } };
}

function indexFacts(ledger: SourceLedger): Map<string, SourceFact[]> {
  const index = new Map<string, SourceFact[]>();
  for (const fact of ledger.facts) { const group = index.get(fact.ref.chunkId) ?? []; group.push(fact); index.set(fact.ref.chunkId, group); }
  return index;
}
function factsFor(index: Map<string, SourceFact[]>, quotations: Quotation[]): string[] {
  return quotations.flatMap(quote => (index.get(quote.ref.chunkId) ?? []).filter(fact => quote.ref.range.start <= fact.ref.range.start && quote.ref.range.end >= fact.ref.range.end).map(fact => fact.factId));
}
const displayedText = (text: string): string => text.replace(/\r\n|\r/g, '\n');
const visibleHash = (value: string | string[][]): string => sourceHash(JSON.stringify(typeof value === 'string' ? displayedText(value) : value.map(row => row.map(displayedText))));

/** Rebinds only unchanged blocks after permitted layout/font revisions, including new split pages. */
export function buildCompiledPageMap(deck: DeckSpec, trace: SourceTraceDraft): CompiledPageMap {
  validateSchema(LEDGER_SCHEMA, trace.ledger);
  const pending = trace.pages.flatMap(page => page.blocks.map(block => ({ page, block })));
  const initialPages = new Map(trace.pages.map(page => [page.initialSlideId, page]));
  const chunkIndex = new Map(trace.ledger.chunks.map(chunk => [chunk.chunkId, chunk]));
  const factIndex = indexFacts(trace.ledger);
  const scenes = resolveDeckScenes(deck, { resolveRects: slide => resolveLayout(slide.layout ?? layoutFor(slide)) });
  let cursor = 0;
  const fragments = new Map<string, number>();
  const pages = deck.slides.map((slide, pageIndex) => {
    const entries = slide.blocks.map(block => {
      const next = pending[cursor++];
      if (!next || JSON.stringify(content(block)) !== JSON.stringify(next.block.expected)) fail('SOURCE_QUOTATION_CHANGED', `${slide.id}/block-${cursor - 1}`);
      return next;
    });
    const planned = entries[0]?.page ?? initialPages.get(slide.id);
    if (!planned || entries.some(entry => entry.page.planSlideId !== planned.planSlideId)) fail('SOURCE_PAGE_BINDING_MISMATCH', slide.id);
    const suffix = slide.title.slice(planned.title.length);
    if (!slide.title.startsWith(planned.title) || !/^(?: \(continued\)|（续）)*$/.test(suffix)) fail('SOURCE_QUOTATION_CHANGED', `${slide.id}/title`);
    const scene = scenes[pageIndex];
    const titleQuotes = planned.titleRef ? [{ ref: planned.titleRef, text: planned.title }] : [];
    const objects: MappedObject[] = [{ objectName: `source-${slide.id}-title`, commandIds: scene.commands.filter(command => command.options.objectName === `source-${slide.id}-title`).map(command => command.id),
      derivedObjectNames: [], sourceRefs: titleQuotes.map(quote => quote.ref), factIds: factsFor(factIndex, titleQuotes), quotations: titleQuotes, generated: !planned.titleRef,
      visibleContentSha256: visibleHash(slide.title) }];
    if (planned.titleRef) objects[0].titleSuffix = suffix;
    else objects[0].generatedText = slide.title;
    entries.forEach((entry, blockIndex) => {
      const quotations = entry.block.quotations;
      for (const quote of quotations) if (resolveRef(trace.ledger, quote.ref, chunkIndex) !== quote.text) fail('SOURCE_QUOTATION_CHANGED', quote.ref.chunkId);
      const commands = scene.commands.filter(command => command.sourceBlockIndex === blockIndex);
      objects.push({ objectName: `source-${slide.id}-block-${blockIndex}`, commandIds: commands.map(command => command.id),
        derivedObjectNames: commands.map(command => String(command.options.objectName)).filter(name => name !== `source-${slide.id}-block-${blockIndex}`),
        sourceRefs: quotations.map(quote => quote.ref), factIds: factsFor(factIndex, quotations), quotations, generated: false,
        visibleContentSha256: visibleHash(slide.blocks[blockIndex].type === 'table' ? [slide.blocks[blockIndex].headers!, ...slide.blocks[blockIndex].rows!] : slide.blocks[blockIndex].text!) });
    });
    const fragmentIndex = fragments.get(planned.planSlideId) ?? 0; fragments.set(planned.planSlideId, fragmentIndex + 1);
    return { page: pageIndex + 1, slideId: slide.id, planSlideId: planned.planSlideId, fragmentIndex, objects };
  });
  if (cursor !== pending.length) fail('PROTECTED_CONTENT_OMITTED', `${pending.length - cursor} source blocks`);
  const map: CompiledPageMap = { schema: 'compiled-page-map', version: '1', sourceLedgerSha256: sourceHash(JSON.stringify(trace.ledger)),
    deckContentSha256: sourceHash(JSON.stringify(deck)), bindingScope: 'exact-source-quotations-and-table-cell-context', semanticTruth: 'NOT_VERIFIED', pages,
    integrity: { sourceReferences: 'PASS', protectedOccurrences: 'PASS', quotationCoverage: 'PASS', tableContext: 'PASS', paraphrase: 'NOT_ALLOWED' },
    readback: { status: 'NOT_ATTEMPTED', scope: 'exact-text-and-cell-object-binding', textNormalization: 'crlf-and-cr-to-lf-only' } };
  validateCompiledPageMap(trace.ledger, map);
  return map;
}

/** Cross references and occurrence coverage, not just JSON shape or a number multiset. */
export function validateCompiledPageMap(ledger: SourceLedger, map: CompiledPageMap): void {
  validateSchema(LEDGER_SCHEMA, ledger); validateSchema(MAP_SCHEMA, map);
  if (map.sourceLedgerSha256 !== sourceHash(JSON.stringify(ledger))) fail('SOURCE_HASH_CHANGED', 'source ledger');
  if (ledger.sourceId !== `source-${ledger.sourceBytesSha256}`) fail('SOURCE_HASH_CHANGED', 'source id');
  if (new Set(ledger.chunks.map(chunk => chunk.chunkId)).size !== ledger.chunks.length || new Set(ledger.facts.map(fact => fact.factId)).size !== ledger.facts.length) fail('SOURCE_REF_DUPLICATE', ledger.sourceId);
  const chunkIndex = new Map(ledger.chunks.map(chunk => [chunk.chunkId, chunk]));
  const factIndex = indexFacts(ledger);
  const tables = new Map<string, Map<string, SourceChunk>>();
  for (const chunk of ledger.chunks) if (chunk.context) {
    const cells = tables.get(chunk.context.tableId) ?? new Map<string, SourceChunk>();
    const key = `${chunk.context.row}:${chunk.context.column}`;
    if (cells.has(key)) fail('TABLE_CONTEXT_CHANGED', chunk.chunkId);
    cells.set(key, chunk); tables.set(chunk.context.tableId, cells);
  }
  for (const chunk of ledger.chunks) {
    if (chunk.chunkId !== `chunk-${sourceHash(`${ledger.sourceId}\n${JSON.stringify(chunk.selector)}`).slice(0, 32)}` || chunk.textSha256 !== sourceHash(chunk.text)) fail('SOURCE_HASH_CHANGED', chunk.chunkId);
    const expected = extractFacts(chunk.text).map(fact => ({ kind: fact.factType, literalValue: fact.literalValue, range: fact.charRange }));
    const found = (factIndex.get(chunk.chunkId) ?? []).map(fact => ({ kind: fact.kind, literalValue: fact.literalValue, range: [fact.ref.range.start, fact.ref.range.end] }));
    if (JSON.stringify(expected) !== JSON.stringify(found)) fail('PROTECTED_OCCURRENCE_OMITTED', chunk.chunkId);
    if (chunk.context) {
      const { row, column, tableId, rowHeader, columnHeader } = chunk.context, cells = tables.get(tableId)!;
      if (row !== chunk.selector.row || column !== chunk.selector.column || rowHeader !== cells.get(`${row}:0`)?.text || columnHeader !== cells.get(`0:${column}`)?.text) fail('TABLE_CONTEXT_CHANGED', chunk.chunkId);
    }
    if ((chunk.role === 'table-cell') !== Boolean(chunk.context)) fail('TABLE_CONTEXT_CHANGED', chunk.chunkId);
  }
  for (const fact of ledger.facts) if (resolveRef(ledger, fact.ref, chunkIndex) !== fact.literalValue || fact.sourceQuote !== chunkIndex.get(fact.ref.chunkId)?.text ||
    fact.factId !== `fact-${sourceHash(`${ledger.sourceId}\n${fact.ref.chunkId}\n${fact.ref.range.start}:${fact.ref.range.end}`).slice(0, 32)}`) fail('FACT_BINDING_MISMATCH', fact.factId);
  const covered = new Map<string, Array<[number, number]>>(), factIds = new Set<string>();
  const textProgress = new Map<string, number>();
  let firstAppearance = 0;
  const slideIds = new Set<string>(), fragments = new Map<string, number>();
  for (const [pageIndex, page] of map.pages.entries()) {
    if (page.page !== pageIndex + 1 || slideIds.has(page.slideId) || page.fragmentIndex !== (fragments.get(page.planSlideId) ?? 0)) fail('SOURCE_PAGE_BINDING_MISMATCH', page.slideId);
    slideIds.add(page.slideId); fragments.set(page.planSlideId, page.fragmentIndex + 1);
    if (new Set(page.objects.map(object => object.objectName)).size !== page.objects.length) fail('RENDER_OBJECT_DUPLICATE', page.slideId);
    for (const [objectIndex, object] of page.objects.entries()) {
    const expectedName = objectIndex === 0 ? `source-${page.slideId}-title` : `source-${page.slideId}-block-${objectIndex - 1}`;
    if (object.objectName !== expectedName || (object.generated ? objectIndex !== 0 || object.quotations.length !== 0 : object.quotations.length === 0)) fail('SOURCE_PAGE_BINDING_MISMATCH', object.objectName);
    if (!object.commandIds.length) fail('RENDER_OBJECT_MISSING', object.objectName);
    if (JSON.stringify(object.sourceRefs) !== JSON.stringify(object.quotations.map(quote => quote.ref))) fail('SOURCE_REF_MISSING', object.objectName);
    for (const quote of object.quotations) {
      if (resolveRef(ledger, quote.ref, chunkIndex) !== quote.text) fail('SOURCE_QUOTATION_CHANGED', `${page.slideId}/${object.objectName}`);
      const chunk = chunkIndex.get(quote.ref.chunkId)!;
      if (chunk.role === 'text') {
        if (objectIndex === 0 || quote.cell || quote.ref.range.start !== (textProgress.get(chunk.chunkId) ?? 0)) fail('SOURCE_ORDER_CHANGED', chunk.chunkId);
        textProgress.set(chunk.chunkId, quote.ref.range.end);
      } else if (quote.ref.range.start !== 0 || quote.ref.range.end !== chunk.text.length) fail('SOURCE_RANGE_MISMATCH', chunk.chunkId);
      if (chunk.role === 'title' && (objectIndex !== 0 || quote.cell)) fail('SOURCE_PAGE_BINDING_MISMATCH', chunk.chunkId);
      if (chunk.role === 'table-cell' && (objectIndex === 0 || !quote.cell || (chunk.context?.row !== 0 && covered.has(chunk.chunkId)))) fail('TABLE_CONTEXT_CHANGED', chunk.chunkId);
      if (!covered.has(chunk.chunkId)) {
        const previous = ledger.chunks[firstAppearance - 1];
        if (previous?.role === 'text' && textProgress.get(previous.chunkId) !== previous.text.length) fail('SOURCE_ORDER_CHANGED', previous.chunkId);
        if (ledger.chunks[firstAppearance++]?.chunkId !== chunk.chunkId) fail('SOURCE_ORDER_CHANGED', chunk.chunkId);
      }
      if (chunk.context && !quote.cell) fail('TABLE_CONTEXT_CHANGED', chunk.chunkId);
      const ranges = covered.get(chunk.chunkId) ?? []; ranges.push([quote.ref.range.start, quote.ref.range.end]); covered.set(chunk.chunkId, ranges);
    }
    const cells = object.quotations.filter(quote => quote.cell);
    if (cells.length) {
      const contexts = cells.map(quote => ({ cell: quote.cell!, context: chunkIndex.get(quote.ref.chunkId)!.context }));
      const tableId = contexts[0].context?.tableId;
      const rowOffset = contexts.find(item => item.cell.row === 1)?.context?.row;
      for (const { cell, context } of contexts) if (!context || context.tableId !== tableId || context.column !== cell.column ||
        (cell.row === 0 ? context.row !== 0 : rowOffset === undefined || context.row !== rowOffset + cell.row - 1)) fail('TABLE_CONTEXT_CHANGED', object.objectName);
      const rows: string[][] = [], seen = new Set<string>();
      for (const quote of cells) {
        const { row, column } = quote.cell!, key = `${row}:${column}`;
        if (seen.has(key)) fail('TABLE_CONTEXT_CHANGED', object.objectName);
        seen.add(key); (rows[row] ??= [])[column] = quote.text;
      }
      const width = rows[0]?.length ?? 0;
      if (object.quotations.length !== cells.length || !width || rows.length !== new Set(cells.map(quote => quote.cell!.row)).size ||
        rows.some((row, rowIndex) => row.length !== width || Array.from({ length: width }, (_, column) => seen.has(`${rowIndex}:${column}`)).some(present => !present)) ||
        visibleHash(rows) !== object.visibleContentSha256) fail('TABLE_CONTEXT_CHANGED', object.objectName);
    } else if (objectIndex === 0) {
      if (object.generated) {
        if (typeof object.generatedText !== 'string' || object.titleSuffix !== undefined || visibleHash(object.generatedText) !== object.visibleContentSha256) fail('SOURCE_PAGE_BINDING_MISMATCH', object.objectName);
      } else if (object.quotations.length !== 1 || typeof object.titleSuffix !== 'string' || !/^(?: \(continued\)|（续）)*$/.test(object.titleSuffix) ||
        object.generatedText !== undefined || visibleHash(object.quotations[0].text + object.titleSuffix) !== object.visibleContentSha256) fail('SOURCE_PAGE_BINDING_MISMATCH', object.objectName);
    } else if (object.quotations.length !== 1 || visibleHash(object.quotations[0].text) !== object.visibleContentSha256 || object.generatedText !== undefined || object.titleSuffix !== undefined) {
      fail('SOURCE_PAGE_BINDING_MISMATCH', object.objectName);
    }
    const expectedFacts = factsFor(factIndex, object.quotations);
    if (JSON.stringify(expectedFacts) !== JSON.stringify(object.factIds)) fail('FACT_BINDING_MISMATCH', object.objectName);
    for (const id of object.factIds) factIds.add(id);
    }
  }
  for (const chunk of ledger.chunks) {
    let end = 0;
    for (const [from, to] of (covered.get(chunk.chunkId) ?? []).sort((a, b) => a[0] - b[0])) {
      if (from > end) fail('PROTECTED_CONTENT_OMITTED', chunk.chunkId); end = Math.max(end, to);
    }
    if (!covered.has(chunk.chunkId) || end !== chunk.text.length) fail('PROTECTED_CONTENT_OMITTED', chunk.chunkId);
  }
  for (const fact of ledger.facts) if (!factIds.has(fact.factId)) fail('PROTECTED_OCCURRENCE_OMITTED', fact.factId);
}

/** Strict readback supplements the renderer's whitespace-tolerant checks. */
export function verifySourceTraceReadback(ledger: SourceLedger, map: CompiledPageMap, actual: RenderedDeckVerification): void {
  validateCompiledPageMap(ledger, map);
  if (!actual.ok || actual.slides.length !== map.pages.length) fail('SOURCE_READBACK_FAILED', 'presentation');
  for (const [index, page] of map.pages.entries()) for (const object of page.objects) {
    const matches = actual.slides[index].objects.filter(item => item.name === object.objectName);
    if (matches.length !== 1) fail('SOURCE_READBACK_FAILED', object.objectName);
    const found = matches[0];
    if (visibleHash(found.type === 'table' ? found.rows ?? [] : found.text) !== object.visibleContentSha256) fail('SOURCE_READBACK_FAILED', object.objectName);
    for (const quote of object.quotations) {
      const actualText = quote.cell ? found.rows?.[quote.cell.row]?.[quote.cell.column] : found.text;
      const text = actualText === undefined ? undefined : displayedText(actualText);
      if ((object.objectName.endsWith('-title') ? text?.slice(0, displayedText(quote.text).length) : text) !== displayedText(quote.text)) fail('SOURCE_READBACK_FAILED', `${object.objectName}/${quote.ref.chunkId}`);
    }
  }
  map.readback = { status: 'PASS', scope: 'exact-text-and-cell-object-binding', textNormalization: 'crlf-and-cr-to-lf-only', artifactSha256: actual.sha256 };
}
