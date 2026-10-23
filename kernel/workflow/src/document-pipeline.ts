import type { DocumentIR } from '@pres/document-parser';
import type { DeckSpec } from '@pres/pptx-engine';
import { sectionsToDeck } from './deck-pipeline.js';

/** Body text, lists, code and cached table values; unsupported assets are explicit errors. */
export function documentToDeck(doc: DocumentIR, fallbackTitle: string): DeckSpec {
  let title = fallbackTitle, firstHeading = false;
  const sections: Array<{ title: string; blocks: any[] }> = [];
  let current: typeof sections[number] | undefined;
  const ensure = () => current ??= { title, blocks: [] };
  const flush = () => { if (current) sections.push(current); current = undefined; };
  for (const block of doc.blocks) {
    switch (block.type) {
      case 'heading':
        if (!firstHeading) { title = block.text; firstHeading = true; }
        if (block.level <= 2) { flush(); current = { title: block.text, blocks: [] }; }
        else ensure().blocks.push({ type: 'text', text: block.text, style: 'h3' });
        break;
      case 'paragraph': if (block.text.trim()) ensure().blocks.push({ type: 'text', text: block.text, style: 'body' }); break;
      case 'list': for (const text of block.items) ensure().blocks.push({ type: 'text', text, style: 'bullet' }); break;
      case 'table': ensure().blocks.push({ type: 'table', headers: [...block.headers], rows: block.rows.map(row => [...row]) }); break;
      case 'code': ensure().blocks.push({ type: 'text', text: block.code, style: 'body' }); break;
      case 'image': throw new Error('Document images require a resolved asset adapter; refusing to omit or open an untrusted source URL');
      default: throw new Error(`Unsupported document block: ${(block as { type: string }).type}`);
    }
  }
  flush();
  return sectionsToDeck(title, sections);
}
