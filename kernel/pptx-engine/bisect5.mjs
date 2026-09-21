// 组合测试：defineLayout 13.33 + fontFace Segoe UI + 中文 + fit shrink + 溢出
import * as pptxgenNS from 'pptxgenjs';
const PptxGenJS = pptxgenNS.default ?? pptxgenNS;
const out = process.argv[2];
const p = new PptxGenJS();
p.defineLayout({ name: 'PRES_16x9', width: 13.33, height: 7.5 });
p.layout = 'PRES_16x9';
const s = p.addSlide();
const texts = [
  '先做基础 Contract，再做 Vertical Slice，最后做 Skill / GUI。',
  'NO EVIDENCE = NO PASS。',
  '可编辑优于贴图',
  '机械 QA 与审美 QA 分离',
  'Native PowerPoint 验证为最终关卡',
];
texts.forEach((t, i) => {
  s.addText(t, { x: 0.6, y: 1.6 + i * 1.38, w: 12.1, h: 1.08, fontSize: 16, valign: 'top', fontFace: 'Segoe UI', wrap: true, fit: 'shrink' });
});
await p.writeFile({ fileName: out });
console.log('wrote', out);
