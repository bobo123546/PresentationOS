// DOCX body text/tables, in document order. Complex objects are not reconstructed.
import { extractZipEntries } from '../zip.js';
import { Block, DocumentIR, ExtractedFact } from '../types.js';
import { extractFacts } from '../fact-extractor.js';
import { readXml, localName, elements, descendants, attribute, textContent, type XmlElement } from '../xml.js';

function paragraphText(node: XmlElement): string {
  return node.children.map(child => {
    if (typeof child === 'string') return '';
    const name = localName(child.name);
    if (name === 't') return textContent(child);
    if (name === 'tab') return '\t';
    if (name === 'br' || name === 'cr') return '\n';
    if (name === 'del') return '';
    return paragraphText(child);
  }).join('');
}

export function parseDocx(buffer: Buffer, sourceFilename = 'document.docx'): { doc: DocumentIR; facts: ExtractedFact[] } {
  const entries = extractZipEntries(buffer), bytes = entries.get('word/document.xml');
  if (!bytes) throw new Error('Invalid DOCX file: word/document.xml not found in archive');
  const document = readXml(bytes), body = elements(document, 'body')[0];
  if (!body) throw new Error('Invalid DOCX file: document body not found');
  const unsupported = ['drawing', 'pict', 'object', 'altChunk', 'oMath', 'oMathPara'].find(name => descendants(body, name).length > 0);
  if (unsupported) throw new Error(`Unsupported DOCX body feature: ${unsupported}; embedded assets and equations require a dedicated adapter`);
  const blocks: Block[] = [], allFacts: ExtractedFact[] = [];
  const factsFor = (text: string): ExtractedFact[] => {
    const facts = extractFacts(text, `chk-docx-${blocks.length}`, allFacts.length);
    allFacts.push(...facts); return facts;
  };
  const table = (node: XmlElement): void => {
    if (descendants(node, 'tbl').length) throw new Error('DOCX nested tables are unsupported');
    const tableRows = elements(node, 'tr').map(row => elements(row, 'tc').flatMap(cell => {
      const paragraphs = descendants(cell, 'p').map(paragraphText), gridSpan = descendants(cell, 'gridSpan')[0];
      const span = gridSpan ? Number(attribute(gridSpan, 'val')) : 1;
      if (!Number.isInteger(span) || span < 1 || span > 16_384) throw new Error('Invalid DOCX table gridSpan');
      return [paragraphs.join('\n'), ...Array<string>(span - 1).fill('')];
    }));
    if (!tableRows.length) return;
    const width = tableRows.reduce((max, row) => Math.max(max, row.length), 0);
    if (width * tableRows.length > 1_000_000) throw new Error('DOCX table exceeds ingestion cell limit');
    for (const row of tableRows) while (row.length < width) row.push('');
    const [headers, ...rows] = tableRows, facts = factsFor(tableRows.map(row => row.join('\t')).join('\n'));
    blocks.push({ type: 'table', headers, rows, facts });
  };
  const visit = (node: XmlElement): void => {
    for (const child of elements(node)) {
      const name = localName(child.name);
      if (name === 'tbl') { table(child); continue; }
      if (name === 'del') continue;
      if (name !== 'p') { visit(child); continue; }
      const text = paragraphText(child);
      if (!text.trim()) continue;
      const style = elements(child, 'pPr').flatMap(p => elements(p, 'pStyle'))[0];
      const styleName = style ? attribute(style, 'val') ?? '' : '';
      const heading = /^(?:heading\s*([1-9])|title)$/i.exec(styleName), facts = factsFor(text);
      if (heading) blocks.push({ type: 'heading', level: Math.min(6, Number(heading[1] ?? 1)), text, facts });
      else blocks.push({ type: 'paragraph', text, facts });
    }
  };
  visit(body);
  return { doc: { schema: 'document-ir', version: '1', source: sourceFilename, sourceType: 'docx', blocks }, facts: allFacts };
}
