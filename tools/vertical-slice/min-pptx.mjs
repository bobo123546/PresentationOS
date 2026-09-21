// 最小化复现：确认 PptxGenJS 默认输出 PowerPoint 能否打开
import * as pptxgenNS from 'pptxgenjs';
const PptxGenJS = pptxgenNS.default ?? pptxgenNS;

async function main() {
  const out = process.argv[2];
  const p = new PptxGenJS();
  const s = p.addSlide();
  s.addText('Minimal test', { x: 1, y: 1, w: 8, h: 1 });
  await p.writeFile({ fileName: out });
  console.log('wrote', out);
}
main();
