// XLSX cached/raw cell values. Number formats and formulas are not evaluated.
import { posix } from 'node:path';
import { extractZipEntries } from '../zip.js';
import { Block, DocumentIR, ExtractedFact } from '../types.js';
import { extractFacts } from '../fact-extractor.js';
import { readXml, elements, descendants, attribute, textContent, type XmlElement } from '../xml.js';

function cellColumn(reference: string): number {
  const match = /^([A-Z]{1,3})([1-9]\d*)$/i.exec(reference);
  if (!match) throw new Error(`Invalid XLSX cell reference: ${reference}`);
  const column = [...match[1].toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  if (column > 16_383) throw new Error(`XLSX cell column is outside worksheet bounds: ${reference}`);
  return column;
}
function textRuns(node: XmlElement): string { return descendants(node, 't').map(textContent).join(''); }
function sheetSources(entries: Map<string, Buffer>): Array<{ name: string; path: string }> {
  const workbook = entries.get('xl/workbook.xml');
  if (!workbook) return [...entries.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(/sheet(\d+)/.exec(a)![1]) - Number(/sheet(\d+)/.exec(b)![1])).map(path => ({ name: posix.basename(path, '.xml'), path }));
  const relBytes = entries.get('xl/_rels/workbook.xml.rels');
  if (!relBytes) throw new Error('Invalid XLSX workbook: sheet relationships not found');
  const relations = new Map(descendants(readXml(relBytes), 'Relationship').map(rel => [attribute(rel, 'Id'), rel]));
  return descendants(readXml(workbook), 'sheet').map(sheet => {
    const relation = relations.get(attribute(sheet, 'id')), target = relation && attribute(relation, 'Target');
    if (!relation || !target || attribute(relation, 'TargetMode') === 'External') throw new Error('Unsupported XLSX external or missing worksheet relationship');
    const path = target.startsWith('/') ? posix.normalize(target.slice(1)) : posix.normalize(posix.join('xl', target));
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path)) throw new Error(`Unsupported XLSX worksheet path: ${path}`);
    return { name: attribute(sheet, 'name') ?? posix.basename(path, '.xml'), path };
  });
}
export function parseXlsx(buffer: Buffer, sourceFilename = 'data.xlsx'): { doc: DocumentIR; facts: ExtractedFact[] } {
  const entries = extractZipEntries(buffer), sources = sheetSources(entries);
  if (!sources.length) throw new Error('Invalid XLSX file: worksheet XML not found');
  const shared = entries.get('xl/sharedStrings.xml');
  const sharedStrings = shared ? descendants(readXml(shared), 'si').map(textRuns) : [];
  const blocks: Block[] = [], allFacts: ExtractedFact[] = [];
  for (const [sheetIndex, source] of sources.entries()) {
    const bytes = entries.get(source.path);
    if (!bytes) throw new Error(`Invalid XLSX file: ${source.path} not found`);
    const rows: string[][] = [];
    for (const row of descendants(readXml(bytes), 'row')) {
      const cells: string[] = []; let nextColumn = 0;
      const occupied = new Set<number>();
      for (const cell of elements(row, 'c')) {
        const reference = attribute(cell, 'r'), column = reference ? cellColumn(reference) : nextColumn;
        if (occupied.has(column)) throw new Error(`Duplicate XLSX cell reference: ${reference}`);
        occupied.add(column); nextColumn = column + 1;
        while (cells.length <= column) cells.push('');
        const value = elements(cell, 'v')[0], formula = elements(cell, 'f')[0];
        if (formula && (!value || !textContent(value).trim())) throw new Error(`XLSX formula has no cached value: ${reference ?? column}`);
        const raw = value ? textContent(value) : '', type = attribute(cell, 't');
        if (type === 's') {
          const index = Number(raw);
          if (!/^\d+$/.test(raw) || !Number.isInteger(index) || index >= sharedStrings.length) throw new Error(`Invalid XLSX shared-string index: ${raw}`);
          cells[column] = sharedStrings[index];
        } else if (type === 'inlineStr') cells[column] = textRuns(cell);
        else cells[column] = raw;
      }
      if (cells.length) rows.push(cells);
      if (rows.length > 100_000) throw new Error('XLSX worksheet exceeds ingestion row limit');
    }
    if (!rows.length) continue;
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    if (width * rows.length > 1_000_000) throw new Error('XLSX worksheet exceeds ingestion cell limit');
    for (const row of rows) while (row.length < width) row.push('');
    if (sources.length > 1) blocks.push({ type: 'heading', level: 1, text: source.name });
    const facts = extractFacts(rows.map(row => row.join('\t')).join('\n'), `chk-xlsx-${sheetIndex}`, allFacts.length);
    allFacts.push(...facts); blocks.push({ type: 'table', headers: rows[0], rows: rows.slice(1), facts });
  }
  return { doc: { schema: 'document-ir', version: '1', source: sourceFilename, sourceType: 'xlsx', blocks }, facts: allFacts };
}
