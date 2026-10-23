import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { designTokensFromDna, extractTemplateDna } from '../src/index.js';

const theme = `<d:theme xmlns:d='http://schemas.openxmlformats.org/drawingml/2006/main' name='Brand &amp; Co'>
<d:themeElements><d:clrScheme name='brand'>
<d:dk1><d:sysClr val='windowText' lastClr='142536'/></d:dk1><d:lt1><d:srgbClr val='FAFBFC'/></d:lt1>
<d:dk2><d:srgbClr val='334455'/></d:dk2><d:lt2><d:srgbClr val='E2E8F0'/></d:lt2>
<d:accent1><d:srgbClr val='A51B2C'/></d:accent1><d:accent2><d:srgbClr val='3C4D5E'/></d:accent2>
</d:clrScheme><d:fontScheme name='brand fonts'>
<d:majorFont><d:latin typeface='Title Latin'/><d:ea typeface='中文标题'/></d:majorFont>
<d:minorFont><d:latin typeface='Body Latin'/><d:ea typeface='中文正文'/></d:minorFont>
</d:fontScheme></d:themeElements></d:theme>`;
const master = `<p:sldMaster xmlns:p='p' xmlns:a='a'><p:cSld name='品牌母版'><p:bg><p:bgPr><a:solidFill><a:schemeClr val='bg1'/></a:solidFill></p:bgPr></p:bg><p:spTree>
<p:sp><p:nvSpPr><p:nvPr><p:ph type='body' idx='1'/></p:nvPr></p:nvSpPr><p:spPr/>
<p:txBody><a:lstStyle><a:lvl1pPr><a:defRPr sz='1800'><a:solidFill><a:schemeClr val='tx1'/></a:solidFill><a:latin typeface='+mn-lt'/><a:ea typeface='+mn-ea'/></a:defRPr></a:lvl1pPr></a:lstStyle></p:txBody></p:sp>
</p:spTree></p:cSld><p:clrMap bg1='lt1' tx1='dk1'/></p:sldMaster>`;
const layout = `<p:sldLayout xmlns:p='p' xmlns:a='a'><p:cSld name='双语标题'><p:spTree><p:sp>
<p:nvSpPr><p:nvPr><p:ph type='title' idx='0'/></p:nvPr></p:nvSpPr><p:spPr>
<a:xfrm><a:off y='457200' x='914400'/><a:ext cy='914400' cx='9144000'/></a:xfrm>
<a:solidFill><a:schemeClr val='accent1'><a:tint val='50000'/></a:schemeClr></a:solidFill>
<a:ln w='19050'><a:solidFill><a:srgbClr val='ABCDEF'/></a:solidFill></a:ln></p:spPr>
<p:txBody><a:p><a:r><a:rPr sz='3200'><a:latin typeface='+mj-lt'/><a:ea typeface='+mj-ea'/></a:rPr><a:t>标题</a:t></a:r></a:p></p:txBody>
</p:sp></p:spTree></p:cSld></p:sldLayout>`;
const relationships = (type: string, target: string, mode = '') => `<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'><Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}' Target='${target}' ${mode}/></Relationships>`;
async function fixture(change?: (zip: JSZip) => void): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('ppt/theme/theme1.xml', theme);
  zip.file('ppt/slideMasters/slideMaster1.xml', master);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', relationships('theme', '../theme/theme1.xml'));
  zip.file('ppt/slideLayouts/slideLayout1.xml', layout);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relationships('slideMaster', '../slideMasters/slideMaster1.xml'));
  change?.(zip);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('zero-slide template resolves semantic theme roles, East Asian fonts and explicit layout styles', async () => {
  const bytes = await fixture(); const before = createHash('sha256').update(bytes).digest('hex');
  const dna = await extractTemplateDna(bytes, '模板.pptx');
  assert.equal(dna.source, '模板.pptx'); assert.equal(dna.sourceSha256, before);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), before);
  assert.equal(dna.slideCount, 0); assert.deepEqual(dna.masters, ['品牌母版']); assert.deepEqual(dna.layouts, ['双语标题']);
  assert.equal(dna.themes?.[0].name, 'Brand & Co');
  assert.equal(dna.themeSelection?.reason, 'master-relationship');
  assert.equal(dna.themes?.[0].fonts.majorLatin, 'Title Latin'); assert.equal(dna.themes?.[0].fonts.minorLatin, 'Body Latin');
  const title = dna.styleSources?.find(s => s.role === 'title')!;
  assert.equal(title.fontSizePt, 32); assert.equal(title.fonts.eastAsia, '中文标题');
  assert.deepEqual(title.geometry, { x: 1, y: 0.5, w: 10, h: 1 });
  assert.equal(title.colors.fill?.hex, 'D28D96'); assert.equal(title.colors.fill?.role, 'accent1');
  assert.equal(title.colors.fill?.sourcePart, 'ppt/slideLayouts/slideLayout1.xml');
  assert.equal(title.colors.fill?.themePart, 'ppt/theme/theme1.xml');
  assert.ok(dna.shapeStyle.lineWidths.some(w => w.width === 1.5));
  assert.deepEqual(designTokensFromDna(dna), {
    schema: 'design-token', version: '1', colors: { primary: '#A51B2C', secondary: '#3C4D5E', background: '#FAFBFC', text: '#142536', accent: '#A51B2C', surface: '#E2E8F0', muted: '#334455', series1: '#A51B2C', series2: '#3C4D5E' },
    fonts: { heading: '中文标题', body: '中文正文' },
  });
  assert.equal(dna.scope, 'theme-and-explicit-styles');
});

test('normalization uses recorded master theme, not another theme or the most common shape paint', async () => {
  const dna = await extractTemplateDna(await fixture(zip => {
    zip.file('ppt/theme/theme2.xml', theme.replace('A51B2C', '00FF00'));
    zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', relationships('theme', '../theme/theme2.xml'));
    zip.file('ppt/slideLayouts/slideLayout2.xml', `<p:sldLayout xmlns:p='p' xmlns:a='a'><p:cSld><p:spTree>${'<p:sp><p:spPr><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr></p:sp>'.repeat(40)}</p:spTree></p:cSld></p:sldLayout>`);
  }));
  const tokens = designTokensFromDna(dna);
  assert.equal(dna.themeSelection?.part, 'ppt/theme/theme2.xml');
  assert.equal(dna.colors[0].hex, 'FF0000');
  assert.equal(tokens.colors.primary, '#00FF00'); assert.equal(tokens.colors.background, '#FAFBFC');
  assert.ok(dna.warnings?.some(w => w.includes('Multiple themes')));
});

test('master-to-layout backlinks are not mistaken for an inheritance cycle', async () => {
  const dna = await extractTemplateDna(await fixture(zip => zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', relationships('theme', '../theme/theme1.xml').replace('</Relationships>', `<Relationship Id='rId2' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout' Target='../slideLayouts/slideLayout1.xml'/></Relationships>`))));
  assert.equal(designTokensFromDna(dna).colors.primary, '#A51B2C');
  assert.equal(dna.styleSources?.find(s => s.role === 'title')?.themePart, 'ppt/theme/theme1.xml');
});

test('normalization does not borrow another masters background despite a shared theme', async () => {
  const dna = await extractTemplateDna(await fixture(zip => {
    zip.file('ppt/slideMasters/slideMaster1.xml', master.replace(/<p:bg>[\s\S]*?<\/p:bg>/, ''));
    zip.file('ppt/slideMasters/slideMaster2.xml', master.replace("<a:schemeClr val='bg1'/>", "<a:srgbClr val='000000'/>"));
    zip.file('ppt/slideMasters/_rels/slideMaster2.xml.rels', relationships('theme', '../theme/theme1.xml'));
  }));
  assert.equal(dna.themeSelection?.masterPart, 'ppt/slideMasters/slideMaster1.xml');
  assert.equal(designTokensFromDna(dna).colors.background, '#FAFBFC');
  assert.equal(dna.styleSources?.find(s => s.role === 'title')?.masterPart, 'ppt/slideMasters/slideMaster1.xml');
});

test('scheme aliases follow master and explicit layout override; unsupported transforms remain unclaimed', async () => {
  const dna = await extractTemplateDna(await fixture(zip => {
    zip.file('ppt/slideLayouts/slideLayout1.xml', layout.replace('</p:sldLayout>', `<p:clrMapOvr><a:overrideClrMapping accent1='accent2'/></p:clrMapOvr></p:sldLayout>`).replace("<a:tint val='50000'/>", "<a:lumMod val='50000'/>"));
  }));
  assert.equal(dna.styleSources?.find(s => s.role === 'title')?.colors.fill, undefined);
  assert.ok(dna.warnings?.some(w => w.includes('Unsupported color transform lumMod')));
  const alias = await extractTemplateDna(await fixture(zip => zip.file('ppt/slideLayouts/slideLayout1.xml', layout.replace("<a:tint val='50000'/>", '').replace('</p:sldLayout>', `<p:clrMapOvr><a:overrideClrMapping accent1='accent2'/></p:clrMapOvr></p:sldLayout>`))));
  assert.equal(alias.styleSources?.find(s => s.role === 'title')?.colors.fill?.hex, '3C4D5E');
  assert.equal(alias.styleSources?.find(s => s.role === 'title')?.colors.fill?.role, 'accent2');
});

test('empty East Asian theme font resolves Hans script before Latin; no theme uses explicit system fallback', async () => {
  const dna = await extractTemplateDna(await fixture(zip => zip.file('ppt/theme/theme1.xml', theme.replace("<d:ea typeface='中文标题'/>", "<d:ea typeface=''/><d:font script='Hans' typeface='思源宋体'/>").replace("<d:ea typeface='中文正文'/>", "<d:ea typeface=''/><d:font script='Hans' typeface='思源黑体'/>"))));
  assert.deepEqual(designTokensFromDna(dna).fonts, { heading: '思源宋体', body: '思源黑体' });
  const oldDna = { ...dna, themes: [], styleSources: [], colors: [{ hex: 'FF0000', count: 1000 }], fonts: [{ name: '+mj-lt', count: 10 }] };
  assert.equal(designTokensFromDna(oldDna).colors.background, '#FFFFFF');
  assert.deepEqual(designTokensFromDna(oldDna).fonts, { heading: 'Microsoft YaHei', body: 'Microsoft YaHei' });
});

test('missing, escaped and external design relationships are rejected', async () => {
  for (const [target, mode] of [['../theme/no.xml', ''], ['../../../outside.xml', ''], ['https://example.com/theme.xml', "TargetMode='External'"]]) {
    await assert.rejects(extractTemplateDna(await fixture(zip => zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', relationships('theme', target, mode)))), /relationship/);
  }
});

test('DTD and malformed nested XML do not produce partial success', async () => {
  await assert.rejects(extractTemplateDna(await fixture(zip => zip.file('ppt/theme/theme1.xml', `<!DOCTYPE theme [<!ENTITY secret SYSTEM 'file:///c:/private'>]>${theme}`))), /DTD/);
  await assert.rejects(extractTemplateDna(await fixture(zip => zip.file('ppt/theme/theme1.xml', theme.replace('</d:fontScheme>', '</wrong>')))), /Mismatched/);
  await assert.rejects(extractTemplateDna(await new JSZip().generateAsync({ type: 'nodebuffer' })), /no presentation/);
});

test('transparent theme colors cannot become opaque design tokens', async () => {
  for (const alpha of ['0', '50000']) {
    const dna = await extractTemplateDna(await fixture(zip => zip.file('ppt/slideMasters/slideMaster1.xml', master.replace("<a:schemeClr val='bg1'/>", `<a:schemeClr val='accent1'><a:alpha val='${alpha}'/></a:schemeClr>`))));
    assert.equal(dna.styleSources?.find(s => s.role === 'background')?.colors.fill, undefined);
    assert.equal(designTokensFromDna(dna).colors.background, '#FAFBFC');
    assert.ok(dna.warnings?.some(w => w.includes('transparency')));
  }
  const transparentScheme = await extractTemplateDna(await fixture(zip => zip.file('ppt/theme/theme1.xml', theme.replace("<d:srgbClr val='FAFBFC'/>", "<d:srgbClr val='FAFBFC'><d:alpha val='0'/></d:srgbClr>"))));
  assert.equal(transparentScheme.themes?.[0].colors.lt1, undefined);
  assert.equal(designTokensFromDna(transparentScheme).colors.background, '#FFFFFF');
  assert.ok(transparentScheme.warnings?.some(w => w.includes('transparency')));
});

test('text outside the document root is rejected rather than partially inspected', async () => {
  await assert.rejects(extractTemplateDna(await fixture(zip => zip.file('ppt/theme/theme1.xml', theme + 'unexpected trailing text'))), /Incomplete/);
});

test('only real accent roles enter series palette; every missing normalized role has a default warning', async () => {
  const full = await extractTemplateDna(await fixture(zip => zip.file('ppt/theme/theme1.xml', theme.replace('</d:clrScheme>', "<d:accent3><d:srgbClr val='116633'/></d:accent3><d:accent6><d:srgbClr val='7344AA'/></d:accent6></d:clrScheme>"))));
  const colors = designTokensFromDna(full).colors;
  assert.equal(colors.series3, '#116633'); assert.equal(colors.series6, '#7344AA'); assert.equal(colors.series4, undefined);
  const empty = new JSZip(); empty.file('ppt/theme/theme1.xml', '<a:theme xmlns:a="a"><a:themeElements/></a:theme>');
  const dna = await extractTemplateDna(await empty.generateAsync({ type: 'nodebuffer' }));
  for (const role of ['colors.primary', 'colors.secondary', 'colors.background', 'colors.text', 'colors.accent', 'colors.surface', 'colors.muted', 'fonts.heading', 'fonts.body']) assert.ok(dna.warnings?.some(w => w.includes(`Default design role ${role}:`)), role);
  assert.equal(designTokensFromDna(dna).colors.series1, undefined);
});
