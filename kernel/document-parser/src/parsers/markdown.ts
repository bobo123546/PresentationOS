// Markdown Document Parser with Block Structure & Fact Extraction
import { Block, DocumentIR, ExtractedFact } from '../types.js';
import { extractFacts } from '../fact-extractor.js';

export function parseMarkdown(
  markdownText: string,
  sourceFilename: string = 'input.md'
): { doc: DocumentIR; facts: ExtractedFact[] } {
  const lines = markdownText.split(/\r?\n/);
  const blocks: Block[] = [];
  const allFacts: ExtractedFact[] = [];
  let chunkCounter = 0;

  let currentParagraph: string[] = [];
  let currentList: { ordered: boolean; items: string[] } | null = null;
  let currentTable: { headers: string[]; rows: string[][] } | null = null;

  function flushParagraph() {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(' ').trim();
      if (text) {
        const chunkId = `chk-${chunkCounter++}`;
        const facts = extractFacts(text, chunkId, allFacts.length);
        allFacts.push(...facts);
        blocks.push({ type: 'paragraph', text, facts });
      }
      currentParagraph = [];
    }
  }

  function flushList() {
    if (currentList && currentList.items.length > 0) {
      const chunkId = `chk-${chunkCounter++}`;
      const joined = currentList.items.join('\n');
      const facts = extractFacts(joined, chunkId, allFacts.length);
      allFacts.push(...facts);
      blocks.push({
        type: 'list',
        ordered: currentList.ordered,
        items: [...currentList.items],
        facts,
      });
      currentList = null;
    }
  }

  function flushTable() {
    if (currentTable && currentTable.headers.length > 0) {
      const chunkId = `chk-${chunkCounter++}`;
      const tableText = currentTable.headers.join(' ') + ' ' + currentTable.rows.map((r) => r.join(' ')).join(' ');
      const facts = extractFacts(tableText, chunkId, allFacts.length);
      allFacts.push(...facts);
      blocks.push({
        type: 'table',
        headers: [...currentTable.headers],
        rows: [...currentTable.rows],
        facts,
      });
      currentTable = null;
    }
  }

  function flushAll() {
    flushParagraph();
    flushList();
    flushTable();
  }

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      flushAll();
      i++;
      continue;
    }

    // Heading
    if (line.startsWith('#')) {
      flushAll();
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const chunkId = `chk-${chunkCounter++}`;
        const facts = extractFacts(text, chunkId, allFacts.length);
        allFacts.push(...facts);
        blocks.push({ type: 'heading', level, text, facts });
        i++;
        continue;
      }
    }

    // Table line
    if (line.includes('|')) {
      flushParagraph();
      flushList();

      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1 || arr.length === 1);

      // Check if this is a separator row (|---|---|)
      const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));

      if (isSeparator) {
        // Just the divider line; do not record as row
        i++;
        continue;
      }

      if (!currentTable) {
        currentTable = { headers: cells, rows: [] };
      } else {
        currentTable.rows.push(cells);
      }
      i++;
      continue;
    } else {
      flushTable();
    }

    // Bullet list or ordered list
    const bulletMatch = line.match(/^[-*+]\s+(.*)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);

    if (bulletMatch || orderedMatch) {
      flushParagraph();
      const isOrdered = Boolean(orderedMatch);
      const itemText = (bulletMatch ? bulletMatch[1] : orderedMatch![1]).trim();

      if (!currentList || currentList.ordered !== isOrdered) {
        flushList();
        currentList = { ordered: isOrdered, items: [itemText] };
      } else {
        currentList.items.push(itemText);
      }
      i++;
      continue;
    } else {
      flushList();
    }

    // Regular paragraph line
    currentParagraph.push(line);
    i++;
  }

  flushAll();

  const doc: DocumentIR = {
    schema: 'document-ir',
    version: '1',
    source: sourceFilename,
    sourceType: 'markdown',
    blocks,
  };

  return { doc, facts: allFacts };
}
