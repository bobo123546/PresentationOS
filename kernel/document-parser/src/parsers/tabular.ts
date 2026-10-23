// Tabular Data Parser (CSV & TSV)
import { Block, DocumentIR, ExtractedFact } from '../types.js';
import { extractFacts } from '../fact-extractor.js';

export function parseCsvRows(content: string, delimiter: string = ','): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === delimiter) {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }

    if (char === '\r') {
      if (i + 1 < content.length && content[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentField.trim());
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function parseTabular(
  content: string,
  format: 'csv' | 'tsv',
  sourceFilename: string = 'data.csv'
): { doc: DocumentIR; facts: ExtractedFact[] } {
  const delimiter = format === 'tsv' ? '\t' : ',';
  const rows = parseCsvRows(content, delimiter);

  const blocks: Block[] = [];
  const allFacts: ExtractedFact[] = [];

  if (rows.length > 0) {
    const headers = rows[0];
    const dataRows = rows.slice(1);

    const chunkId = 'chk-table-0';
    const allTableText = headers.join(' ') + ' ' + dataRows.map((r) => r.join(' ')).join(' ');
    const facts = extractFacts(allTableText, chunkId, 0);
    allFacts.push(...facts);

    blocks.push({
      type: 'table',
      headers,
      rows: dataRows,
      facts,
    });
  }

  const doc: DocumentIR = {
    schema: 'document-ir',
    version: '1',
    source: sourceFilename,
    sourceType: format,
    blocks,
  };

  return { doc, facts: allFacts };
}
