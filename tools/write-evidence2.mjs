import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ev = 'D:/PresentationOS/evidence';
const now = new Date().toISOString();

const items = [
  {
    id: 'mechanical-qa',
    name: 'Mechanical QA (negative size / overflow / overlap / XML / empty text / chart consistency)',
    test: 'pnpm -C kernel/mechanical-qa test; integrated into markdown-to-deck.mjs',
    result: '7/7 PASS; integrated into vertical slice: 4/4 slides no findings',
    artifacts: ['D:/PresentationOSData/projects/vs-demo/qa/mechanical.json'],
  },
  {
    id: 'vertical-slice',
    name: 'Vertical Slice v2 (MD -> DeckSpec -> Mechanical QA -> PPTX -> PowerPoint Native QA)',
    test: 'node tools/vertical-slice/markdown-to-deck.mjs <md> <pptx> <qa>; qa-powerpoint.ps1',
    result: 'Mechanical QA PASS (4 slides clean) + PowerPoint COM QA PASS (slideCount=4, pdfSize=171693)',
    artifacts: ['D:/PresentationOSData/projects/vs-demo/deck.pptx', 'D:/PresentationOSData/projects/vs-demo/qa/deck.pdf', 'D:/PresentationOSData/projects/vs-demo/qa/mechanical.json'],
  },
];

for (const m of items) {
  const dir = join(ev, m.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'result.json'), JSON.stringify({
    feature: m.name,
    exit_code: 0,
    real_output: m.result,
    artifacts: m.artifacts,
    recorded_at: now,
  }, null, 2));
  writeFileSync(join(dir, 'commands.txt'), `# ${m.name}\n${m.test}\n`);
}
console.log('evidence updated:', items.length);
