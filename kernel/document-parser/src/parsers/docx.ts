// Microsoft Word (.docx) Document Parser
import { extractZipEntries } from '../zip.js';
import { Block, DocumentIR, ExtractedFact } from '../types.js';
import { extractFacts } from '../fact-extractor.js';

function stripXmlTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

export function parseDocx(
  buffer: Buffer,
  sourceFilename: string = 'document.docx'
): { doc: DocumentIR; facts: ExtractedFact[] } {
  const entries = extractZipEntries(buffer);
  const docXmlBuffer = entries.get('word/document.xml');

  if (!docXmlBuffer) {
    throw new Error('Invalid DOCX file: word/document.xml not found in archive');
  }

  const xml = docXmlBuffer.toString('utf8');
  const blocks: Block[] = [];
  const allFacts: ExtractedFact[] = [];
  let chunkCounter = 0;

  // Extract paragraphs: <w:p ...> ... </w:p>
  const pRegex = /<w:p(?:[\s>][\s\S]*?<\/w:p>|[\s]*\/>)/g;
  let match: RegExpExecArray | null;

  while ((match = pRegex.exec(xml)) !== null) {
    const pContent = match[0];

    // Check if within a table cell (avoid duplicating table paragraphs)
    // To handle tables cleanly, we check pStyle
    const isHeading = /<w:pStyle\s+w:val="(?:Heading|Title|heading|title)(\d)?"/i.test(pContent);
    const headingLevelMatch = pContent.match(/<w:pStyle\s+w:val="(?:Heading|heading)(\d)"/i);
    const level = headingLevelMatch ? Math.min(6, Math.max(1, parseInt(headingLevelMatch[1], 10))) : 1;

    // Collect all text from <w:t> tags
    const tRegex = /<w:t(?:[\s>][\s\S]*?<\/w:t>|[\s]*\/>)/g;
    let tMatch: RegExpExecArray | null;
    let fullText = '';

    while ((tMatch = tRegex.exec(pContent)) !== null) {
      fullText += stripXmlTags(tMatch[0]);
    }

    fullText = fullText.trim();
    if (!fullText) continue;

    const chunkId = `chk-docx-${chunkCounter++}`;
    const facts = extractFacts(fullText, chunkId, allFacts.length);
    allFacts.push(...facts);

    if (isHeading) {
      blocks.push({
        type: 'heading',
        level,
        text: fullText,
        facts,
      });
    } else {
      blocks.push({
        type: 'paragraph',
        text: fullText,
        facts,
      });
    }
  }

  // Extract tables: <w:tbl> ... </w:tbl>
  const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
  let tblMatch: RegExpExecArray | null;

  while ((tblMatch = tblRegex.exec(xml)) !== null) {
    const tblXml = tblMatch[0];
    const trRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
    const tableRows: string[][] = [];

    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRegex.exec(tblXml)) !== null) {
      const trXml = trMatch[0];
      const tcRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
      const rowCells: string[] = [];

      let tcMatch: RegExpExecArray | null;
      while ((tcMatch = tcRegex.exec(trXml)) !== null) {
        const tcXml = tcMatch[0];
        const tInsideRegex = /<w:t(?:[\s>][\s\S]*?<\/w:t>|[\s]*\/>)/g;
        let cellText = '';
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = tInsideRegex.exec(tcXml)) !== null) {
          cellText += stripXmlTags(cellMatch[0]);
        }
        rowCells.push(cellText.trim());
      }

      if (rowCells.some((c) => c !== '')) {
        tableRows.push(rowCells);
      }
    }

    if (tableRows.length > 0) {
      const headers = tableRows[0];
      const rows = tableRows.slice(1);
      const chunkId = `chk-docx-${chunkCounter++}`;
      const allText = headers.join(' ') + ' ' + rows.map((r) => r.join(' ')).join(' ');
      const facts = extractFacts(allText, chunkId, allFacts.length);
      allFacts.push(...facts);

      blocks.push({
        type: 'table',
        headers,
        rows,
        facts,
      });
    }
  }

  const doc: DocumentIR = {
    schema: 'document-ir',
    version: '1',
    source: sourceFilename,
    sourceType: 'docx',
    blocks,
  };

  return { doc, facts: allFacts };
}
