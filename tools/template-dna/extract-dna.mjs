// 集成：对真实 deck.pptx 提取 Template DNA
import { readFileSync, writeFileSync } from 'node:fs';
import { extractTemplateDna } from '../../kernel/template-dna/dist/index.js';

const pptx = process.argv[2];
const out = process.argv[3];
const buf = readFileSync(pptx);
const dna = await extractTemplateDna(buf, pptx);
writeFileSync(out, JSON.stringify(dna, null, 2), 'utf8');
console.log(JSON.stringify({
  source: dna.source,
  slideCount: dna.slideCount,
  masters: dna.masters,
  layouts: dna.layouts,
  topColors: dna.colors.slice(0, 5),
  fonts: dna.fonts.slice(0, 5),
  titlePositions: dna.titlePositions,
}, null, 2));
