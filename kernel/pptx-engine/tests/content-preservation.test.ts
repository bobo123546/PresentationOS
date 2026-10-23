import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import {renderDeck,readRenderedDeck,verifyRenderedDeck,resolveDeckScenes,type DeckSpec} from '../src/index.js';

const rects=()=>new Map<string,{x:number;y:number;w:number;h:number}>();
async function temporary(run:(dir:string)=>Promise<void>){const dir=mkdtempSync(join(tmpdir(),'pres-content-'));try{await run(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
async function render(dir:string,deck:DeckSpec){const path=join(dir,'deck.pptx');const result=await renderDeck(deck,{outPath:path,resolveRects:rects});assert.equal(result.verification.ok,true);return {path,actual:await readRenderedDeck(readFileSync(path))};}
const texts=(actual:Awaited<ReturnType<typeof readRenderedDeck>>)=>actual.flatMap(s=>s.texts).join('\n');

test('all cover source blocks survive an explicit subtitle and actual package readback',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'预算',subtitle:'副标题',slides:[{id:'cover',kind:'cover',title:'预算',blocks:[{type:'text',text:'来源A预算37万元。'},{type:'text',text:'来源B预算58万元。'},{type:'text',text:'来源C预算91万元。'}]}]};
  const {actual}=await render(dir,deck);const content=texts(actual);
  for(const value of ['副标题','37万元','58万元','91万元'])assert.ok(content.includes(value));
}));

test('ordinary medical cover adds no approval, institution, fact-preservation or default-topic claim',async()=>temporary(async dir=>{
  const {actual}=await render(dir,{title:'健康知识',domain:'medical',slides:[{id:'s',kind:'cover',title:'健康知识',blocks:[]}]});
  const content=texts(actual);for(const banned of ['IRB','国家医学中心','100%','临床试验队列','成果发布'])assert.equal(content.includes(banned),false);
}));

test('mixed text, both tables and native chart all survive with distinct source mappings',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'混排',slides:[{id:'s',kind:'data',title:'混排',blocks:[
    {type:'text',text:'结论MARKER'},
    {type:'table',headers:['指标'],rows:[['FIRST_TABLE']]},
    {type:'table',headers:['指标'],rows:[['SECOND_TABLE']]},
    {type:'chart',chartType:'bar',data:{labels:['类别A','类别B'],series:[{name:'销售额',values:[-12.5,10000]}]}},
  ]}]};
  const {actual}=await render(dir,deck);assert.equal(actual[0].objects.filter(o=>o.type==='table').length,2);
  const chart=actual[0].objects.find(o=>o.type==='chart')!;
  assert.deepEqual(chart.series,[{name:'销售额',labels:['类别A','类别B'],values:[-12.5,10000]}]);
  for(const value of ['结论MARKER','FIRST_TABLE','SECOND_TABLE'])assert.ok(texts(actual).includes(value));
}));

test('metric highlights preserve negative sign and thousands separators exactly',async()=>temporary(async dir=>{
  const {actual}=await render(dir,{title:'指标',slides:[{id:'s',kind:'cardGrid',title:'指标',blocks:[{type:'text',text:'净利润 -12.5万元（负数）'},{type:'text',text:'累计服务 10,000家机构'}]}]});
  const derived=actual[0].objects.filter(o=>o.name.startsWith('derived-')).map(o=>o.text);
  assert.deepEqual(derived,['-12.5万元','10,000家']);
  assert.ok(texts(actual).includes('净利润 -12.5万元（负数）'));
}));

test('readback rejects a truncated thousands highlight while retaining the correct original text',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'指标',slides:[{id:'s',kind:'cardGrid',title:'指标',blocks:[{type:'text',text:'累计服务 10,000家机构'}]}]};
  const {path}=await render(dir,deck);const zip=await JSZip.loadAsync(readFileSync(path));let xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
  xml=xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g,shape=>shape.includes('name="derived-s-metric-0"')?shape.replace('10,000家','000家'):shape);zip.file('ppt/slides/slide1.xml',xml);
  const changed=join(dir,'bad-highlight.pptx');writeFileSync(changed,await zip.generateAsync({type:'nodebuffer'}));
  const checked=await verifyRenderedDeck(changed,deck);assert.equal(checked.ok,false);assert.ok(checked.missing.some(value=>value.includes('not traceable to source')));
}));

test('archetypes retain distinct native vector structures and source content',async()=>temporary(async dir=>{
  const kinds=['architecture','pyramid','funnel','timeline','process','team','comparison','quadrant','quote','cardGrid'] as const;
  const slides=kinds.map(kind=>({id:kind,kind,title:kind,blocks:Array.from({length:kind==='comparison'?2:kind==='quadrant'?4:kind==='quote'?1:3},(_,i)=>({type:'text',text:`${kind} 来源${i+1} 共${i+1}万元`}))}));
  const deck:DeckSpec={title:'原型',slides};const {actual}=await render(dir,deck);
  const scenes=resolveDeckScenes(deck,{resolveRects:rects});
  const shapes=(kind:string)=>scenes.find(scene=>scene.slideId===kind)!.commands.filter(command=>command.type==='shape').map(command=>command.shape);
  for(const kind of ['pyramid','funnel'])assert.ok(shapes(kind).includes('trapezoid'));
  for(const kind of ['team','timeline'])assert.ok(shapes(kind).includes('ellipse'));
  assert.ok(shapes('timeline').includes('line'));assert.ok(shapes('process').includes('chevron'));assert.ok(shapes('architecture').includes('rect'));
  assert.deepEqual(shapes('quote'),['roundRect','line','line']);
  slides.forEach((slide,i)=>slide.blocks.forEach(block=>assert.ok(actual[i].texts.includes(block.text))));
}));

test('native table styling preserves cells, compact geometry and numeric alignment',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'表格',slides:[{id:'s',kind:'table',title:'表格',blocks:[{type:'table',headers:['项目','预算'],rows:[['A','-12.5万元'],['B','10,000']]}]}]};
  const {path,actual}=await render(dir,deck);const scene=resolveDeckScenes(deck,{resolveRects:rects})[0],table=scene.commands.find(command=>command.type==='table')!;
  assert.equal(table.rect.h,1.26);assert.deepEqual(actual[0].objects.find(object=>object.type==='table')!.rows,[['项目','预算'],['A','-12.5万元'],['B','10,000']]);
  const zip=await JSZip.loadAsync(readFileSync(path));const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
  assert.ok(xml.includes('val="1E293B"'));assert.ok(xml.includes('val="FFFFFF"'));assert.ok(xml.includes('algn="r"'));assert.ok(xml.includes('anchor="ctr"'));
}));

test('early-slide native tables use unique drawing IDs before publication',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'低页序表格',author:'PresentationOS',slides:[1,2,3,4].map(n=>({id:`s${n}`,kind:'content',title:`第${n}页`,blocks:[{type:'table',headers:['指标','数值'],rows:[['净利润','-12.5'],['客户','10,000']]}]}))};
  const {path}=await render(dir,deck);const zip=await JSZip.loadAsync(readFileSync(path));
  for(let n=1;n<=4;n++){
    const xml=await zip.file(`ppt/slides/slide${n}.xml`)!.async('string');const ids=[...xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length,`duplicate drawing IDs on slide${n}`);
  }
  const xml=await zip.file('ppt/slides/slide1.xml')!.async('string');zip.file('ppt/slides/slide1.xml',xml.replace(/(<p:graphicFrame>[\s\S]*?<p:cNvPr id=")\d+/, '$12'));
  const changed=join(dir,'duplicate-id.pptx');writeFileSync(changed,await zip.generateAsync({type:'nodebuffer'}));await assert.rejects(()=>verifyRenderedDeck(changed,deck),/duplicate drawing IDs/);
}));

test('cancellation after native slide drawing has started yields to the event loop and publishes nothing',async()=>temporary(async dir=>{
  const prototype=(PptxGenJS as unknown as {prototype:{addSlide:(...args:unknown[])=>unknown}}).prototype;
  const original=prototype.addSlide,controller=new AbortController();let drawn=0;
  prototype.addSlide=function(...args:unknown[]){
    drawn++;
    if(drawn===16)setImmediate(()=>controller.abort());
    return original.apply(this,args);
  };
  const deck:DeckSpec={title:'绘制过程中取消',slides:Array.from({length:200},(_,i)=>({id:`s${i}`,kind:'content',title:`第${i}页`,blocks:[{type:'text',text:`真实内容${i}万元。`}]}))};
  const output=join(dir,'cancelled.pptx');
  try{
    await assert.rejects(()=>renderDeck(deck,{outPath:output,resolveRects:rects,signal:controller.signal}),/cancelled/);
    assert.ok(drawn>=16&&drawn<200,`Expected partial native drawing, got ${drawn}`);
    assert.equal(existsSync(output),false);
  }finally{prototype.addSlide=original;}
}));

test('quadrant badges retain explicit Q identities for source-order Q1,Q2,Q3,Q4',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'象限',slides:[{id:'s',kind:'quadrant',title:'象限',blocks:[1,2,3,4].map(n=>({type:'text',text:`Q${n} 原始分类${n}`}))}]};
  const scene=resolveDeckScenes(deck,{resolveRects:rects})[0];
  const {actual}=await render(dir,deck);
  for(let i=0;i<4;i++){
    const source=scene.commands.find(c=>c.sourceBlockIndex===i&&c.type==='text')!;
    const badge=scene.commands.find(c=>c.role==='decoration'&&c.text===`Q${i+1}`)!;
    assert.equal(source.rect.x,badge.rect.x);
    assert.equal(actual[0].objects.find(o=>o.name===`source-s-block-${i}`)!.text,`Q${i+1} 原始分类${i+1}`);
  }
  assert.ok(scene.blocks[0].rect.x>scene.blocks[1].rect.x);
}));

test('explicit over-capacity layouts reject before publishing, never drop a fifth architecture block',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'容量',slides:[{id:'s',kind:'architecture',title:'五层',blocks:[1,2,3,4,5].map(n=>({type:'text',text:`第${n}层`}))}]};
  const output=join(dir,'rejected.pptx');await assert.rejects(()=>renderDeck(deck,{outPath:output,resolveRects:rects}),/accepts 1-4 blocks/);assert.equal(existsSync(output),false);
  deck.slides[0].kind='content';const {actual}=await render(dir,deck);for(const n of [1,2,3,4,5])assert.ok(texts(actual).includes(`第${n}层`));
}));

test('final scene content geometry and actual PPTX source geometry are identical',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'几何',slides:[{id:'s',kind:'content',title:'两项',blocks:[{type:'text',text:'GEOMETRY_ONE'},{type:'text',text:'GEOMETRY_TWO'}]}]};
  const scene=resolveDeckScenes(deck,{resolveRects:rects})[0];const {actual}=await render(dir,deck);
  for(const c of scene.commands.filter(c=>c.role==='content'&&c.type==='text')){
    const object=actual[0].objects.find(o=>o.name===c.options.objectName)!;assert.ok(object.rect);
    for(const axis of ['x','y','w','h'] as const)assert.ok(Math.abs(object.rect![axis]-c.rect[axis])<0.000002,`${axis} diverged`);
  }
}));

test('actual package verification rejects deleted content and altered native chart values',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'修改门禁',slides:[{id:'s',kind:'content',title:'内容',blocks:[{type:'text',text:'不可删除的58万元'},{type:'chart',chartType:'bar',data:{labels:['A'],series:[{name:'预算',values:[58]}]}}]}]};
  const {path}=await render(dir,deck);const zip=await JSZip.loadAsync(readFileSync(path));
  const slide=await zip.file('ppt/slides/slide1.xml')!.async('string');zip.file('ppt/slides/slide1.xml',slide.replace('不可删除的58万元','已经丢失'));
  const chartPart=Object.keys(zip.files).find(name=>/^ppt\/charts\/chart\d+\.xml$/.test(name))!;
  const chart=await zip.file(chartPart)!.async('string');assert.ok(chart.includes('<c:v>58</c:v>'));zip.file(chartPart,chart.replace('<c:v>58</c:v>','<c:v>59</c:v>'));
  const changed=join(dir,'changed.pptx');writeFileSync(changed,await zip.generateAsync({type:'nodebuffer'}));
  const checked=await verifyRenderedDeck(changed,deck);assert.equal(checked.ok,false);assert.ok(checked.missing.some(v=>v.includes('source text differs')));assert.ok(checked.missing.some(v=>v.includes('chart names, labels or values differ')));
}));

test('readback rejects new unsupported authority text even when all original content remains',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'健康知识',domain:'medical',slides:[{id:'s',kind:'cover',title:'健康知识',blocks:[{type:'text',text:'公开的健康知识说明'}]}]};
  const {path}=await render(dir,deck);const zip=await JSZip.loadAsync(readFileSync(path));let xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
  const source=[...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].find(match=>match[0].includes('name="source-s-block-0"'))![0];
  const injected=source.replace(/(<p:cNvPr id=")\d+/, '$1999').replace('name="source-s-block-0"','name="unsupported-authority"').replace('公开的健康知识说明','国家医学中心 · IRB伦理审查通过');
  xml=xml.replace('</p:spTree>',injected+'</p:spTree>');zip.file('ppt/slides/slide1.xml',xml);
  const changed=join(dir,'injected.pptx');writeFileSync(changed,await zip.generateAsync({type:'nodebuffer'}));
  const checked=await verifyRenderedDeck(changed,deck);assert.equal(checked.ok,false);assert.ok(checked.missing.some(value=>value.includes('not traceable to source')));
}));

test('package order changes and final command geometry changes fail actual readback',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'顺序',slides:[{id:'first',kind:'content',title:'第一页',blocks:[{type:'text',text:'FIRST'}]},{id:'second',kind:'content',title:'第二页',blocks:[{type:'text',text:'SECOND'}]}]};
  const {path}=await render(dir,deck);const scenes=resolveDeckScenes(deck,{resolveRects:rects});
  const zip=await JSZip.loadAsync(readFileSync(path));let presentation=await zip.file('ppt/presentation.xml')!.async('string');
  const ids=[...presentation.matchAll(/<p:sldId\s[^>]*\/?\s*>/g)].map(match=>match[0]);assert.equal(ids.length,2);
  presentation=presentation.replace(ids.join(''),ids.reverse().join(''));zip.file('ppt/presentation.xml',presentation);
  const reordered=join(dir,'reordered.pptx');writeFileSync(reordered,await zip.generateAsync({type:'nodebuffer'}));assert.equal((await verifyRenderedDeck(reordered,deck)).ok,false);
  const original=await JSZip.loadAsync(readFileSync(path));let xml=await original.file('ppt/slides/slide1.xml')!.async('string');
  xml=xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g,shape=>shape.includes('name="source-first-block-0"')?shape.replace(/<a:off x="\d+"/, '<a:off x="91440000"'):shape);
  original.file('ppt/slides/slide1.xml',xml);const moved=join(dir,'moved.pptx');writeFileSync(moved,await original.generateAsync({type:'nodebuffer'}));
  const checked=await verifyRenderedDeck(moved,deck,scenes);assert.equal(checked.ok,false);assert.ok(checked.missing.some(value=>value.includes('geometry differs')));
}));

test('duplicate identical source blocks require both actual mapped objects',async()=>temporary(async dir=>{
  const deck:DeckSpec={title:'重复',slides:[{id:'s',kind:'content',title:'两个相同来源',blocks:[{type:'text',text:'相同文字12万元'},{type:'text',text:'相同文字12万元'}]}]};
  const {path}=await render(dir,deck);const zip=await JSZip.loadAsync(readFileSync(path));let xml=await zip.file('ppt/slides/slide1.xml')!.async('string');
  xml=xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g,shape=>shape.includes('name="source-s-block-1"')?'':shape);zip.file('ppt/slides/slide1.xml',xml);
  const changed=join(dir,'missing-object.pptx');writeFileSync(changed,await zip.generateAsync({type:'nodebuffer'}));const check=await verifyRenderedDeck(changed,deck);assert.equal(check.ok,false);assert.ok(check.missing.some(v=>v.includes('block-1: source object is missing')));
}));

test('unsupported mixed archetypes and invalid chart data fail explicitly',async()=>temporary(async dir=>{
  const output=join(dir,'bad.pptx');
  await assert.rejects(()=>renderDeck({title:'bad',slides:[{id:'s',kind:'comparison',title:'bad',blocks:[{type:'text',text:'A'},{type:'table',headers:['H'],rows:[['V']]}]}]},{outPath:output,resolveRects:rects}),/requires text blocks/);
  await assert.rejects(()=>renderDeck({title:'bad',slides:[{id:'s',kind:'content',title:'bad',blocks:[{type:'chart',data:{labels:['A','B'],series:[{name:'N',values:[1]}]}}]}]},{outPath:output,resolveRects:rects}),/matching finite/);
  assert.equal(existsSync(output),false);
}));
