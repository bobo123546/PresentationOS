// 二分：多文本块页
import * as pptxgenNS from 'pptxgenjs';
const PptxGenJS = pptxgenNS.default ?? pptxgenNS;
const mode = process.argv[3] ?? 'plain';
const out = process.argv[2];
const p = new PptxGenJS();
const s = p.addSlide();
if (mode === 'plain') {
  for (let i = 0; i < 5; i++) {
    s.addText(`line ${i}`, { x: 0.6, y: 1.6 + i, w: 12, h: 0.8, fontSize: 16, wrap: true });
  }
} else if (mode === 'fit') {
  for (let i = 0; i < 5; i++) {
    s.addText(`line ${i}`, { x: 0.6, y: 1.6 + i, w: 12, h: 0.8, fontSize: 16, wrap: true, fit: 'shrink' });
  }
} else if (mode === 'styles') {
  const styles = ['h1', 'h2', 'h3', 'bullet', 'quote', 'small', 'body'];
  styles.forEach((st, i) => {
    s.addText(`${st} text`, { x: 0.6, y: 1.4 + i * 0.85, w: 12, h: 0.75, fontSize: 16, wrap: true, fit: 'shrink' });
  });
} else if (mode === 'newline') {
  s.addText('> 先做基础 Contract，再做 Vertical Slice，最后做 Skill / GUI。\n> NO EVIDENCE = NO PASS。', { x: 0.6, y: 1.6, w: 12, h: 1.5, fontSize: 16, wrap: true, fit: 'shrink' });
}
await p.writeFile({ fileName: out });
console.log('wrote', out, mode);
