// Supported subset: headings, paragraphs, bullets, quotes and pipe tables.
export function mdToDeck(md, name = 'deck') {
  let title = name.replace(/\.md$/i, '');
  const sections = [];
  let current;
  let table;
  const ensure = () => current ??= { title, blocks: [] };
  const flush = () => { if (current) sections.push(current); current = undefined; table = undefined; };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      table = undefined;
      if (heading[1].length === 1) { title = heading[2].trim(); continue; }
      if (heading[1].length === 2) { flush(); current = { title: heading[2].trim(), blocks: [] }; }
      else ensure().blocks.push({type:'text', text:heading[2].trim(), style:'h3'});
      continue;
    }
    if (!line.trim()) { table = undefined; continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().slice(1,-1).split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g,'|'));
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      if (table) table.rows.push(cells);
      else { table = {type:'table',headers:cells,rows:[]}; ensure().blocks.push(table); }
      continue;
    }
    table = undefined;
    const special = /^(>|[-*])\s+(.*)$/.exec(line);
    ensure().blocks.push({type:'text', text:special ? special[2] : line.trim(), style:special ? (special[1]==='>' ? 'quote' : 'bullet') : 'body'});
  }
  flush();
  if (!sections.length) throw new Error('Markdown contains no presentation content');
  const slides = [];
  for (const section of sections) {
    const blocks = section.blocks.flatMap((block) => {
      if (block.type === 'text') {
        const chars = Array.from(block.text);
        const parts=[];
        for(let i=0;i<chars.length;i+=700) parts.push({...block,text:chars.slice(i,i+700).join('')});
        return parts.length ? parts : [block];
      }
      if (!block.rows.length) return [block];
      const parts=[];
      for(let i=0;i<block.rows.length;i+=8) parts.push({...block,rows:block.rows.slice(i,i+8)});
      return parts;
    });
    const pages=[];
    let page=[], cost=0;
    for(const block of blocks) {
      const next = block.type==='table' ? 4 : Math.max(1,Math.ceil(block.text.length/220));
      if(page.length && cost+next>4) {pages.push(page);page=[];cost=0;}
      page.push(block);cost+=next;
    }
    if(page.length || !pages.length) pages.push(page);
    pages.forEach((page,index) => {
      const slide={id:`slide-${slides.length+1}`,kind:slides.length===0?'cover':'content',title:section.title+(index?' (continued)':''),blocks:page};
      slide.layout=layoutFor(slide);slides.push(slide);
    });
  }
  return {schema:'deck-spec',version:'1',title,author:'PresentationOS',slides};
}
export function layoutFor(slide) {
  const n=Math.max(1,slide.blocks.length);
  const available=5.4;
  const fraction=Math.max(0.05,(available-(n-1)*0.3)/n/available);
  return {schema:'layout-ir',version:'1',width:13.33,height:7.5,direction:'column',gap:'md',padding:{top:1.6,left:0.6,right:0.6,bottom:0.5},children:slide.blocks.map((block,i)=>({id:`block-${i}`,kind:block.type,width:1,height:fraction}))};
}
