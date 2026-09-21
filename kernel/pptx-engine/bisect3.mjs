// 测试：中文文本页
import * as pptxgenNS from 'pptxgenjs';
const PptxGenJS = pptxgenNS.default ?? pptxgenNS;
const out = process.argv[2];
const p = new PptxGenJS();
const s = p.addSlide();
s.background = { color: 'F8FAFC' };
s.addText('设计原则', { x: 0.6, y: 0.35, w: 12.1, h: 0.8, fontSize: 28, bold: true, color: '111827' });
s.addShape('rect', { x: 0.6, y: 1.15, w: 1.2, h: 0.06, fill: { color: '10B981' }, line: { color: '10B981' } });
const texts = [
  '先做基础 Contract，再做 Vertical Slice，最后做 Skill / GUI。',
  'NO EVIDENCE = NO PASS。',
  '可编辑优于贴图',
  '机械 QA 与审美 QA 分离',
  'Native PowerPoint 验证为最终关卡',
];
texts.forEach((t, i) => {
  s.addText(t, { x: 0.6, y: 1.6 + i * 1.1, w: 12.1, h: 0.9, fontSize: 16, color: '111827', valign: 'top', wrap: true, fit: 'shrink' });
});
await p.writeFile({ fileName: out });
console.log('wrote', out);
