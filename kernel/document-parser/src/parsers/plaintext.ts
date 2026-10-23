// Plaintext Document Parser
import { Block, DocumentIR, ExtractedFact } from '../types.js';
import { extractFacts } from '../fact-extractor.js';

export function parsePlaintext(
  text: string,
  sourceFilename: string = 'input.txt'
): { doc: DocumentIR; facts: ExtractedFact[] } {
  const paragraphs = text.split(/\r?\n\s*\r?\n/);
  const blocks: Block[] = [];
  const allFacts: ExtractedFact[] = [];
  let chunkCounter = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const rawPara = paragraphs[i].trim();
    if (!rawPara) continue;

    const chunkId = `chk-${chunkCounter++}`;
    const facts = extractFacts(rawPara, chunkId, allFacts.length);
    allFacts.push(...facts);

    // Heuristic: First short line without trailing period can be a heading
    if (i === 0 && rawPara.length < 80 && !rawPara.includes('\n') && !rawPara.endsWith('.')) {
      blocks.push({
        type: 'heading',
        level: 1,
        text: rawPara,
        facts,
      });
    } else {
      blocks.push({
        type: 'paragraph',
        text: rawPara,
        facts,
      });
    }
  }

  const doc: DocumentIR = {
    schema: 'document-ir',
    version: '1',
    source: sourceFilename,
    sourceType: 'plaintext',
    blocks,
  };

  return { doc, facts: allFacts };
}
