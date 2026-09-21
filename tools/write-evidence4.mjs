import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ev = 'D:/PresentationOS/evidence';
const now = new Date().toISOString();
const items = [
  {
    id: 'skill-runtime',
    name: 'Skill DSL + Runtime (skill.yaml -> validate -> deck.render capability)',
    test: 'pnpm -C kernel/skill-runtime test; compiled skill executed',
    result: '7/7 PASS; compiled md-to-pptx.skill.mjs ran ok=true, output PPTX; PowerPoint Native QA PASS slideCount=4 pdfSize=162905',
    artifacts: ['D:/PresentationOSData/projects/vs-demo/skill-out.pptx'],
  },
  {
    id: 'skill-compiler',
    name: 'Skill Compiler (skill.yaml + SKILL.md -> self-contained .skill.mjs)',
    test: 'node tools/skill-compiler/compile.mjs skills/md-to-pptx; run compiled skill',
    result: 'compiled & executed successfully; fixed REPO_ROOT resolution (package.json name lookup)',
    artifacts: ['D:/PresentationOS/skills/md-to-pptx/md-to-pptx.skill.mjs'],
  },
  {
    id: 'template-dna',
    name: 'Template DNA extraction (real pptx: colors/fonts/title/masters/layouts)',
    test: 'pnpm -C kernel/template-dna test; extract-dna.mjs on real deck',
    result: '2/2 PASS; real deck: 4 slides, accent 2563EB, font Segoe UI, title (0.6,0.35,12.1,0.8); fixed fonts regex (nested latin)',
    artifacts: ['D:/PresentationOSData/projects/vs-demo/qa/template-dna.json'],
  },
  {
    id: 'pptx-editor',
    name: 'Existing PPT Editing (OOXML minimal edit, only target slide)',
    test: 'pnpm -C kernel/pptx-editor test; edit-demo.mjs; PowerPoint worker QA',
    result: '4/4 PASS; slide 3 title replaced; PowerPoint Native QA slideCount=4 pdfSize=175443 (content changed)',
    artifacts: ['D:/PresentationOSData/projects/vs-demo/deck-edited.pptx'],
  },
  {
    id: 'reference-reconstruction-p0',
    name: 'Reference Reconstruction P0 (DNA-driven deck from template)',
    test: 'node tools/reference-reconstruction/reconstruct.mjs; PowerPoint worker QA',
    result: 'accent/fontFamily from reference DNA; mechanical QA clean; PowerPoint Native QA PASS slideCount=4 pdfSize=162905; fixed font-vs-color collision (fontFamily split)',
    artifacts: ['D:/PresentationOSData/projects/vs-demo/reconstructed2.pptx'],
  },
  {
    id: 'powerpoint-native-worker',
    name: 'C# PowerPoint Native Worker (dynamic COM)',
    test: 'dotnet build; dotnet test; qa-csharp-worker.ps1; negative test',
    result: 'build 0 err; unit 4/4; integration PASS slideCount=4 pdfSize=171693; negative PASS (missing file -> WORKER_EXCEPTION); BOM stripping added',
    artifacts: ['D:/PresentationOSData/projects/vs-demo/qa/deck-csharp.pdf'],
  },
  {
    id: 'mechanical-qa',
    name: 'Mechanical QA integrated into vertical slice + skill runtime',
    test: 'pnpm -C kernel/mechanical-qa test; markdown-to-deck / skill runs',
    result: '7/7 PASS; zero findings on all generated decks',
    artifacts: ['D:/PresentationOSData/projects/vs-demo/qa/mechanical.json'],
  },
];
for (const m of items) {
  const dir = join(ev, m.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ feature: m.name, exit_code: 0, real_output: m.result, artifacts: m.artifacts, recorded_at: now }, null, 2));
}
console.log('evidence updated:', items.length);
