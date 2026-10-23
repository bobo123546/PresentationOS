// Microsoft Excel (.xlsx) Spreadsheet Parser
import { extractZipEntries } from '../zip.js';
import { Block, DocumentIR, ExtractedFact } from '../types.js';
import { extractFacts } from '../fact-extractor.js';

function stripXmlTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

export function parseXlsx(
  buffer: Buffer,
  sourceFilename: string = 'data.xlsx'
): { doc: DocumentIR; facts: ExtractedFact[] } {
  const entries = extractZipEntries(buffer);
  const sheetXmlBuffer = entries.get('xl/worksheets/sheet1.xml');

  if (!sheetXmlBuffer) {
    throw new Error('Invalid XLSX file: xl/worksheets/sheet1.xml not found');
  }

  // Parse shared strings table if present
  const sharedStrings: string[] = [];
  const ssBuffer = entries.get('xl/sharedStrings.xml');
  if (ssBuffer) {
    const ssXml = ssBuffer.toString('utf8');
    const siRegex = /<si[\s\S]*?<\/si>/g;
    let siMatch: RegExpExecArray | null;
    while ((siMatch = siRegex.exec(ssXml)) !== null) {
      const tRegex = /<t(?:[\s>][\s\S]*?<\/t>|[\s]*\/>)/g;
      let tMatch: RegExpExecArray | null;
      let text = '';
      while ((tMatch = tRegex.exec(siMatch[0])) !== null) {
        text += stripXmlTags(tMatch[0]);
      }
      sharedStrings.push(text);
    }
  }

  // Parse rows from sheet1.xml
  const sheetXml = sheetXmlBuffer.toString('utf8');
  const rowRegex = /<row[\s\S]*?<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  const rows: string[][] = [];

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowXml = rowMatch[0];
    const cRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cMatch: RegExpExecArray | null;
    const rowCells: string[] = [];

    while ((cMatch = cRegex.exec(rowXml)) !== null) {
      const attrs = cMatch[1];
      const cellBody = cMatch[2];
      const isSharedString = /t="s"/i.test(attrs);

      const vMatch = cellBody.match(/<v>([\s\S]*?)<\/v>/);
      let cellValue = '';

      if (vMatch) {
        const rawVal = vMatch[1].trim();
        if (isSharedString) {
          const idx = parseInt(rawVal, 10);
          cellValue = sharedStrings[idx] ?? '';
        } else {
          cellValue = rawVal;
        }
      } else {
        // Direct inline string: <is><t>...</t></is>
        const isMatch = cellBody.match(/<t[\s\S]*?>([\s\S]*?)<\/t>/);
        if (isMatch) {
          cellValue = stripXmlTags(isMatch[1]);
        }
      }
      rowCells.push(cellValue.trim());
    }

    if (rowCells.some((c) => c !== '')) {
      rows.push(rowCells);
    }
  }

  const blocks: Block[] = [];
  const allFacts: ExtractedFact[] = [];

  if (rows.length > 0) {
    const headers = rows[0];
    const dataRows = rows.slice(1);
    const chunkId = 'chk-xlsx-0';
    const tableText = headers.join(' ') + ' ' + dataRows.map((r) => r.join(' ')).join(' ');
    const facts = extractFacts(tableText, chunkId, 0);
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
    sourceType: 'xlsx',
    blocks,
  };

  return { doc, facts: allFacts };
}
