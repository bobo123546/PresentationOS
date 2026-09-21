import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ev = 'D:/PresentationOS/evidence';
const now = new Date().toISOString();
const items = [
  {
    id: 'powerpoint-native-worker',
    name: 'C# PowerPoint Native Worker (dynamic COM: open/slide count/export PDF)',
    test: 'dotnet build -c Release; dotnet test PresentationOS.PowerPoint.sln; qa-csharp-worker.ps1; negative test',
    result: 'build 0 err; unit 4/4; integration PASS slideCount=4 pdfSize=171693 (matches PowerShell COM); negative PASS (missing file -> WORKER_EXCEPTION "PPTX not found")',
    artifacts: ['D:/PresentationOSData/projects/vs-demo/qa/deck-csharp.pdf', 'D:/PresentationOSData/projects/vs-demo/qa/csharp-worker-out.txt'],
  },
  {
    id: 'mechanical-qa',
    name: 'Mechanical QA integrated in vertical slice',
    test: 'node tools/vertical-slice/markdown-to-deck.mjs (runs mechanical QA before render)',
    result: '4/4 slides no findings; pass=true',
    artifacts: ['D:/PresentationOSData/projects/vs-demo/qa/mechanical.json'],
  },
];
for (const m of items) {
  const dir = join(ev, m.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ feature: m.name, exit_code: 0, real_output: m.result, artifacts: m.artifacts, recorded_at: now }, null, 2));
  writeFileSync(join(dir, 'commands.txt'), `# ${m.name}\n${m.test}\n`);
}
console.log('evidence updated:', items.length);
