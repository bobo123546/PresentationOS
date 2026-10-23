import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { createHash } from 'node:crypto';
import type { DeckSpec, SlideBlock, ResolvedSlideScene } from './renderer.js';
import { metricLiteral } from './metric.js';

export interface RenderedObject {
  name: string;
  type: 'text' | 'table' | 'chart' | 'image' | 'shape';
  text: string;
  rows?: string[][];
  series?: Array<{name: string; labels: string[]; values: number[]}>;
  rect?: {x:number;y:number;w:number;h:number};
}

export interface RenderedSlideContent {
  part: string;
  objects: RenderedObject[];
  texts: string[];
  notes: string;
}

export interface RenderedDeckVerification {
  ok: boolean;
  path: string;
  sha256: string;
  scope: 'ooxml-content-readback';
  nativeValidation: 'NOT_ATTEMPTED';
  missing: string[];
  slides: Array<{slideId:string;part:string;objects:RenderedObject[];missing:string[]}>;
}

function decode(text: string): string {
  return text.replace(/&(?:#x([\da-f]+)|#(\d+)|amp|lt|gt|quot|apos);/gi,(entity,hex,dec)=>{
    if(hex || dec)return String.fromCodePoint(parseInt(hex??dec,hex?16:10));
    return ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"} as Record<string,string>)[entity]??entity;
  });
}
const normalized = (text:string) => text.replace(/\s+/gu,' ').trim();

function textIn(xml: string): string {
  return [...xml.matchAll(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g)]
    .map(p=>[...p[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(t=>decode(t[1])).join('')).join('\n');
}

function attr(xml:string,name:string):string {
  return decode(new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(xml)?.[1]??'');
}

function relationships(xml:string, part:string):Map<string,string> {
  const result=new Map<string,string>();
  for(const m of xml.matchAll(/<Relationship\s[^>]*\/?\s*>/g)){
    if(attr(m[0],'TargetMode')==='External')continue;
    const target=attr(m[0],'Target');
    const resolved=target.startsWith('/')?target.slice(1):posix.normalize(posix.join(posix.dirname(part),target));
    if(!resolved.startsWith('ppt/'))throw new Error('PPTX relationship escaped the presentation package');
    result.set(attr(m[0],'Id'),resolved);
  }
  return result;
}

function chartSeries(xml:string):RenderedObject['series'] {
  const values=(part:string)=>[...part.matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map(v=>decode(v[1]));
  return [...xml.matchAll(/<c:ser>[\s\S]*?<\/c:ser>/g)].map(s=>{
    const tx=/<c:tx>([\s\S]*?)<\/c:tx>/.exec(s[0])?.[1]??'';
    const cat=/<c:cat>([\s\S]*?)<\/c:cat>/.exec(s[0])?.[1]??'';
    const val=/<c:val>([\s\S]*?)<\/c:val>/.exec(s[0])?.[1]??'';
    return {name:values(tx)[0]??'',labels:values(cat),values:values(val).map(Number)};
  });
}

/** Read the actual generated objects. This is content verification, not an Office/rendering certificate. */
export async function readRenderedDeck(buffer: Buffer): Promise<RenderedSlideContent[]> {
  const zip=await JSZip.loadAsync(buffer,{checkCRC32:true});
  const presentation=zip.file('ppt/presentation.xml'), presentationRels=zip.file('ppt/_rels/presentation.xml.rels');
  if(!presentation || !presentationRels)throw new Error('PPTX presentation or relationships are missing');
  const presentationXml=await presentation.async('string');
  const rels=relationships(await presentationRels.async('string'),'ppt/presentation.xml');
  // The slideshow order is defined by relationships, not by numerical ZIP part names.
  const parts=[...presentationXml.matchAll(/<p:sldId\s[^>]*\/?\s*>/g)].map(match=>{
    const part=rels.get(attr(match[0],'r:id'));
    if(!part || !/^ppt\/slides\/[^/]+\.xml$/.test(part) || !zip.file(part))throw new Error('PPTX contains a missing or unsupported slide relationship');
    return part;
  });
  if(new Set(parts).size!==parts.length)throw new Error('PPTX contains duplicate slide relationships');
  const slides:RenderedSlideContent[]=[];
  for(const part of parts){
    const xml=await zip.file(part)!.async('string');
    const drawingIds=[...xml.matchAll(/<p:cNvPr\b[^>]*>/g)].map(match=>attr(match[0],'id'));
    if(drawingIds.some(id=>!/^\d+$/.test(id)||Number(id)<1) || new Set(drawingIds).size!==drawingIds.length)throw new Error(`PPTX contains invalid or duplicate drawing IDs in ${part}`);
    const relPart=posix.join(posix.dirname(part),'_rels',posix.basename(part)+'.rels');
    const relFile=zip.file(relPart);
    const rels=relationships(relFile?await relFile.async('string'):'',part);
    const objects:RenderedObject[]=[];
    for(const match of xml.matchAll(/<p:(sp|graphicFrame|pic)(?:\s[^>]*)?>[\s\S]*?<\/p:\1>/g)){
      const raw=match[0], props=/<p:cNvPr\b[^>]*>/.exec(raw)?.[0]??'';
      const name=attr(props,'name');
      const off=/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/.exec(raw);
      const ext=/<a:ext\s+cx="(-?\d+)"\s+cy="(-?\d+)"/.exec(raw);
      const object:RenderedObject={name,type:match[1]==='pic'?'image':'text',text:textIn(raw)};
      if(off&&ext)object.rect={x:Number(off[1])/914400,y:Number(off[2])/914400,w:Number(ext[1])/914400,h:Number(ext[2])/914400};
      if(raw.includes('<a:tbl>')){
        object.type='table';
        object.rows=[...raw.matchAll(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g)].map(row=>[...row[0].matchAll(/<a:tc\b[^>]*>[\s\S]*?<\/a:tc>/g)].map(cell=>textIn(cell[0])));
      }else if(raw.includes('<c:chart ')){
        object.type='chart';
        const chartPart=rels.get(/<c:chart\b[^>]*\br:id="([^"]+)"/.exec(raw)?.[1]??'');
        if(!chartPart||!zip.file(chartPart))throw new Error(`Missing chart relationship in ${part}`);
        object.series=chartSeries(await zip.file(chartPart)!.async('string'));
      }else if(match[1]==='sp'&&!raw.includes('<p:txBody>'))object.type='shape';
      objects.push(object);
    }
    let notes='';
    const notePart=[...rels.values()].find(n=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
    if(notePart&&zip.file(notePart))notes=textIn(await zip.file(notePart)!.async('string'));
    slides.push({part,objects,texts:objects.filter(o=>o.text).map(o=>o.text),notes});
  }
  return slides;
}

function blockMismatch(block:SlideBlock, object:RenderedObject|undefined):string|undefined {
  if(!object)return 'source object is missing';
  if(object.type!==block.type && !(block.type==='shape'&&object.type==='text'))return `object type ${object.type} does not match ${block.type}`;
  switch(block.type){
    case 'text':if(normalized(object.text)!==normalized(block.text??''))return 'source text differs';break;
    case 'table':{
      const expected=[block.headers??[],...(block.rows??[])].map(row=>row.map(normalized));
      const actual=object.rows?.map(row=>row.map(normalized));
      if(JSON.stringify(expected)!==JSON.stringify(actual))return 'table rows or cells differ';break;
    }
    case 'chart':
      if(JSON.stringify(block.data?.series.map(s=>({name:s.name,labels:block.data!.labels,values:s.values})))!==JSON.stringify(object.series))return 'chart names, labels or values differ';
      break;
    case 'image':break; // Placement identity is checked; pixel fidelity requires independent visual/native QA.
    case 'shape':break;
    default:return `unverified content type: ${block.type}`;
  }
}

export async function verifyRenderedDeck(path:string,deck:DeckSpec,scenes?:ResolvedSlideScene[]):Promise<RenderedDeckVerification> {
  const bytes=await readFile(path),actual=await readRenderedDeck(bytes),missing:string[]=[];
  if(actual.length!==deck.slides.length)missing.push(`Slide count ${actual.length} != expected ${deck.slides.length}`);
  const slides=deck.slides.map((slide,index)=>{
    const found=actual[index], errors:string[]=[];
    const get=(name:string)=>found?.objects.find(o=>o.name===name);
    const names=found?.objects.map(o=>o.name)??[];
    if(new Set(names).size!==names.length)errors.push('duplicate object names prevent unambiguous source mapping');
    const title=get(`source-${slide.id}-title`);
    if(!title||normalized(title.text)!==normalized(slide.title))errors.push('title missing or changed');
    if(slide.kind==='cover'&&deck.subtitle){
      const subtitle=get(`source-${slide.id}-subtitle`);
      if(!subtitle||normalized(subtitle.text)!==normalized(deck.subtitle))errors.push('subtitle missing or changed');
    }
    slide.blocks.forEach((block,i)=>{
      const name=`source-${slide.id}-block-${i}`, mismatch=blockMismatch(block,get(name));
      if(mismatch)errors.push(`block-${i}: ${mismatch}`);
      if(block.type==='shape'&&block.label&&normalized(get(`${name}-label`)?.text??'')!==normalized(block.label))errors.push(`block-${i}: shape label differs`);
    });
    for(const object of found?.objects??[]){
      if(!object.text.trim() || object.type==='table')continue;
      const isSource=object.name===`source-${slide.id}-title` || object.name===`source-${slide.id}-subtitle` || slide.blocks.some((block,i)=>
        object.name===`source-${slide.id}-block-${i}` || (block.type==='shape' && object.name===`source-${slide.id}-block-${i}-label`));
      if(isSource)continue;
      const sourceIndex=/^derived-.*-metric-(\d+)$/.exec(object.name)?.[1];
      const derivedSource=sourceIndex===undefined?undefined:slide.blocks[Number(sourceIndex)];
      const isDerived=derivedSource?.type==='text' && normalized(metricLiteral(derivedSource.text??'')??'')===normalized(object.text);
      const isDecoration=object.text===deck.author || object.text===`${index+1} / ${deck.slides.length}` || (/^Q[1-4]$/.test(object.text) && (slide.kind==='quadrant' || slide.archetype==='quadrant' || /象限|矩阵|优先级|matrix|quadrant/i.test(slide.title)));
      if(!isDerived&&!isDecoration)errors.push(`unexpected text object ${object.name}: not traceable to source content`);
    }
    const scene=scenes?.[index];
    if(scene){
      const expectedNames=new Set(scene.commands.map(command=>String(command.options.objectName)));
      for(const object of found?.objects??[])if(!expectedNames.has(object.name))errors.push(`unexpected rendered object ${object.name}`);
      for(const command of scene.commands){
        const object=get(String(command.options.objectName));
        if(!object){errors.push(`final command ${command.id} is missing`);continue;}
        if(object.type!==command.type)errors.push(`final command ${command.id} changed type`);
        if(command.type==='text' && normalized(object.text)!==normalized(command.text??''))errors.push(`final command ${command.id} changed text`);
        if(!object.rect || (['x','y','w','h'] as const).some(axis=>Math.abs(object.rect![axis]-command.rect[axis])>0.000002))errors.push(`final command ${command.id} geometry differs`);
      }
    }
    if(slide.notes&&!normalized(found?.notes??'').includes(normalized(slide.notes)))errors.push('speaker notes missing or changed');
    missing.push(...errors.map(e=>`${slide.id}: ${e}`));
    return {slideId:slide.id,part:found?.part??'',objects:found?.objects??[],missing:errors};
  });
  return {ok:missing.length===0,path,sha256:createHash('sha256').update(bytes).digest('hex'),scope:'ooxml-content-readback',nativeValidation:'NOT_ATTEMPTED',missing,slides};
}
