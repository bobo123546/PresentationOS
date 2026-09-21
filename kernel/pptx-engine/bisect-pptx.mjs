// 二分：逐个特性叠加，找出 PowerPoint 打不开的触发点
import * as pptxgenNS from 'pptxgenjs';
const PptxGenJS = pptxgenNS.default ?? pptxgenNS;

const feature = process.argv[3] ?? 'plain';
const out = process.argv[2];
const p = new PptxGenJS();
const s = p.addSlide();

switch (feature) {
  case 'plain': {
    s.addText('plain', { x: 1, y: 1, w: 8, h: 1 });
    break;
  }
  case 'layout16x9': {
    p.defineLayout({ name: 'PRES_16x9', width: 13.33, height: 7.5 });
    p.layout = 'PRES_16x9';
    s.addText('layout16x9', { x: 1, y: 1, w: 8, h: 1 });
    break;
  }
  case 'background': {
    s.background = { color: '1F2937' };
    s.addText('bg', { x: 1, y: 1, w: 8, h: 1, color: 'FFFFFF' });
    break;
  }
  case 'shape': {
    s.addShape('rect', { x: 1, y: 1, w: 3, h: 1, fill: { color: '2563EB' }, line: { color: '2563EB' } });
    break;
  }
  case 'line': {
    s.addShape('line', { x: 1, y: 1, w: 3, h: 0.5, line: { color: '2563EB', width: 2 } });
    break;
  }
  case 'arrow': {
    s.addShape('line', { x: 1, y: 1, w: 3, h: 0.5, line: { color: '2563EB', width: 2 }, beginArrow: { type: 'none' }, endArrow: { type: 'triangle' } });
    break;
  }
  case 'table': {
    s.addTable([['H', 'V'], ['a', 'b']], { x: 1, y: 1, w: 4, h: 1, border: { pt: 0.5, color: 'D1D5DB' }, fill: { color: 'F9FAFB' }, fontSize: 12 });
    break;
  }
  case 'chart': {
    s.addChart('column', [{ name: 'S', labels: ['A', 'B'], values: [1, 2] }], { x: 1, y: 1, w: 4, h: 2, showLegend: true });
    break;
  }
  case 'notes': {
    s.addText('with notes', { x: 1, y: 1, w: 8, h: 1 });
    s.addNotes('speaker note');
    break;
  }
  case 'all': {
    p.defineLayout({ name: 'PRES_16x9', width: 13.33, height: 7.5 });
    p.layout = 'PRES_16x9';
    s.background = { color: 'FFFFFF' };
    s.addShape('rect', { x: 0.6, y: 1.15, w: 1.2, h: 0.06, fill: { color: '2563EB' }, line: { color: '2563EB' } });
    s.addText('title', { x: 0.6, y: 0.35, w: 12.1, h: 0.8, fontSize: 28, bold: true, color: '111827' });
    s.addTable([['H', 'V'], ['a', 'b']], { x: 1, y: 2, w: 4, h: 1, border: { pt: 0.5, color: 'D1D5DB' }, fill: { color: 'F9FAFB' }, fontSize: 12 });
    s.addChart('bar', [{ name: 'S', labels: ['A', 'B'], values: [1, 2] }], { x: 6, y: 2, w: 4, h: 2, showLegend: true });
    s.addShape('line', { x: 1, y: 4, w: 3, h: 0.5, line: { color: '2563EB', width: 2 }, beginArrow: { type: 'none' }, endArrow: { type: 'triangle' } });
    s.addNotes('speaker note');
    break;
  }
  default:
    s.addText('unknown', { x: 1, y: 1, w: 8, h: 1 });
}
await p.writeFile({ fileName: out });
console.log('wrote', out, feature);
