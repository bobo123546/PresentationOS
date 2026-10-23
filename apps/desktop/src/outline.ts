import type { SlideItem } from './types.js';

/** A source outline, not a claim about the renderer's eventual pagination. */
export function parseMarkdownToSlides(markdown: string, previous: SlideItem[] = []): SlideItem[] {
  const slides: SlideItem[] = [];
  let current: SlideItem | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    if (heading) {
      current = { id: `slide-${slides.length}`, title: heading[2], bullets: [],
        headingLevel: heading[1].length as 1 | 2, layout: slides.length ? 'bullet_list' : 'title' };
      slides.push(current);
    } else {
      if (!current && !line.trim()) continue;
      if (!current) {
        current = { id: 'slide-0', title: '概述', headingLevel: 1, bullets: [], layout: 'bullet_list' };
        slides.push(current);
      }
      current.bullets.push(line);
    }
  }
  for (const [index, section] of slides.entries()) {
    const before = previous.find(s => s.title === section.title && s.id === section.id)
      ?? (previous.length === slides.length ? previous[index] : previous.find(s => s.title === section.title));
    if (before) { section.speakerNotes = before.speakerNotes; section.layout = before.layout; }
  }
  return slides;
}

export function outlineToMarkdown(slides: SlideItem[]): string {
  return slides.map(slide => `${'#'.repeat(slide.headingLevel ?? 2)} ${slide.title}\n${slide.bullets.join('\n')}`).join('\n\n');
}
