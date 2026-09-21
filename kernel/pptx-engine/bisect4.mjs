// 测试：文本块超出页面底部（模拟 page-3 布局溢出）
import * as pptxgenNS from 'pptxgenjs';
const PptxGenJS = pptxgenNS.default ?? pptxgenNS;
const out = process.argv[2];
const p = new PptxGenJS();
const s = p.addSlide();
const texts = ['a', 'b', 'c', 'd', 'e'];
texts.forEach((t, i) => {
  s.addText(t, { x: 0.6, y: 1.6 + i * 1.38, w: 12.1, h: 1.08, fontSize: 16, valign: 'top', wrap: true, fit: 'shrink' });
});
await p.writeFile({ fileName: out });
console.log('wrote', out);
