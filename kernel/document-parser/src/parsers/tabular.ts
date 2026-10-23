// Delimited records, preserving quoted newlines, significant whitespace and empty cells.
import { Block, DocumentIR, ExtractedFact } from '../types.js';
import { extractFacts } from '../fact-extractor.js';

export function parseCsvRows(content: string, delimiter = ','): string[][] {
  if (delimiter.length !== 1 || /[\r\n"]/.test(delimiter)) throw new Error('Invalid CSV/TSV delimiter');
  const rows: string[][] = []; let row: string[] = [], field = '', touched = false;
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  const finishField = (): void => { row.push(field); field = ''; state = 'start'; };
  const finishRecord = (): void => {
    if (touched) { finishField(); rows.push(row); }
    row = []; field = ''; state = 'start'; touched = false;
  };
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (state === 'quoted') {
      if (char === '"') {
        if (content[index + 1] === '"') { field += '"'; index++; }
        else state = 'closed';
      } else field += char;
      continue;
    }
    if (char === delimiter) { finishField(); touched = true; continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && content[index + 1] === '\n') index++;
      finishRecord(); continue;
    }
    if (state === 'closed') throw new Error(`Invalid CSV/TSV text after closing quote at offset ${index}`);
    if (char === '"') {
      if (state !== 'start') throw new Error(`Invalid CSV/TSV quote inside an unquoted field at offset ${index}`);
      state = 'quoted'; touched = true; continue;
    }
    field += char; touched = true; state = 'plain';
  }
  if ((state as string) === 'quoted') throw new Error('Invalid CSV/TSV: unclosed quoted field');
  finishRecord();
  return rows;
}

export function parseTabular(content: string, format: 'csv' | 'tsv', sourceFilename = 'data.csv'): { doc: DocumentIR; facts: ExtractedFact[] } {
  const rows = parseCsvRows(content, format === 'tsv' ? '\t' : ',');
  const blocks: Block[] = [], allFacts: ExtractedFact[] = [];
  if (rows.length) {
    const [headers, ...dataRows] = rows;
    for (const [index, row] of dataRows.entries()) if (row.length !== headers.length) {
      throw new Error(`Invalid ${format.toUpperCase()} record ${index + 2}: expected ${headers.length} columns, received ${row.length}`);
    }
    const text = rows.map(row => row.join('\t')).join('\n');
    const facts = extractFacts(text, 'chk-table-0', 0); allFacts.push(...facts);
    blocks.push({ type: 'table', headers, rows: dataRows, facts });
  }
  return { doc: { schema: 'document-ir', version: '1', source: sourceFilename, sourceType: format, blocks }, facts: allFacts };
}
