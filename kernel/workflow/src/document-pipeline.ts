import type { DocumentIR } from '@pres/document-parser';
import type { DeckSpec } from '@pres/pptx-engine';
import { sectionsToDeck, type SourceSection } from './deck-pipeline.js';

/** Body text, lists, code and cached table values; unsupported assets are explicit errors. */
export function documentToDeck(doc: DocumentIR, fallbackTitle: string): DeckSpec {
  const parsed = documentSections(doc, fallbackTitle);
  return sectionsToDeck(parsed.title, parsed.sections);
}

export function documentSections(doc: DocumentIR, fallbackTitle: string): { title: string; sections: SourceSection[] } {
  let title = fallbackTitle, firstHeading = false;
  const sections: SourceSection[] = [];
  let current: typeof sections[number] | undefined;
  const ensure = () => current ??= { title, blocks: [], blockSelectors: [] };
  const flush = () => { if (current) sections.push(current); current = undefined; };
  for (const [blockIndex, block] of doc.blocks.entries()) {
    const selector = { part: 'document-ir.blocks', block: blockIndex };
    const push = (value: any, item?: number) => { ensure().blocks.push(value); ensure().blockSelectors!.push({ ...selector, ...(item === undefined ? {} : { item }) }); };
    switch (block.type) {
      case 'heading':
        if (!firstHeading) { title = block.text; firstHeading = true; }
        if (block.level <= 2) { flush(); current = { title: block.text, blocks: [], blockSelectors: [], titleSelector: selector }; }
        else push({ type: 'text', text: block.text, style: 'h3' });
        break;
      case 'paragraph': if (block.text.trim()) push({ type: 'text', text: block.text, style: 'body' }); break;
      case 'list': for (const [item, text] of block.items.entries()) push({ type: 'text', text, style: 'bullet' }, item); break;
      case 'table': push({ type: 'table', headers: [...block.headers], rows: block.rows.map(row => [...row]) }); break;
      case 'code': push({ type: 'text', text: block.code, style: 'body' }); break;
      case 'image': throw new Error('Document images require a resolved asset adapter; refusing to omit or open an untrusted source URL');
      default: throw new Error(`Unsupported document block: ${(block as { type: string }).type}`);
    }
  }
  flush();
  return { title, sections };
}
