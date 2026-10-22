import { resolveLayout, resolveSlideScene } from '../../kernel/pptx-engine/dist/index.js';
import { runMechanicalQa } from '../../kernel/mechanical-qa/dist/index.js';
import { runVisualQa } from '../../kernel/visual-qa/dist/index.js';
import { layoutFor } from '../vertical-slice/md2deck.mjs';

export function inspectDeck(deck) {
  const mechanical = [];
  const slides = deck.slides.map((slide, index) => {
    const scene = resolveSlideScene(slide, () => resolveLayout(slide.layout ?? layoutFor(slide)));
    const rects = [{id:'title', ...scene.title.rect}, ...scene.blocks.map(({id,rect})=>({id,...rect}))];
    const check = runMechanicalQa({pageWidth:13.33,pageHeight:7.5,rects,blocks:[{id:'title',type:'text',text:slide.title},...scene.blocks.map(({id,block})=>({id,...block}))]});
    mechanical.push({slide:slide.id,...check});
    return { index:index+1,kind:slide.kind,title:slide.title,blocks:[
      {id:'title',kind:'title',text:slide.title,rect:scene.title.rect,style:{fontSize:scene.title.fontSize,color:scene.theme.font,bg:scene.theme.fill}},
      ...scene.blocks.map(({id,block,rect,fontSize})=>({id,kind:block.type==='text'?'body':block.type,text:block.type==='table'?[block.headers,...block.rows].flat().join(' '):block.text,rect,style:{fontSize,color:block.type==='table'?'111827':block.color??scene.theme.font,bg:block.type==='table'?'F9FAFB':scene.theme.fill}}))
    ]};
  });
  const visual=runVisualQa(slides);
  const mechanicalPass=mechanical.every((check)=>check.ok && !check.findings.some((finding)=>['overflow','overlap'].includes(finding.check)));
  return {passed:mechanicalPass&&!visual.issues.some((issue)=>issue.severity==='error'),mechanical:{pass:mechanicalPass,slides:mechanical},visual,native:{status:'NOT_ATTEMPTED'}};
}
