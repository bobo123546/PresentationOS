import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { editPptx, revertPptx, type EditOp } from '../src/index.js';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const before = '<a:r><a:rPr sz="2800" lang="zh-CN"><a:solidFill><a:srgbClr val="1254AA"/></a:solidFill></a:rPr><a:t xml:space="preserve">Old &amp; </a:t></a:r>';
const tail = '<a:r><a:rPr b="1" i="1" sz="1800"/><a:t>Tail</a:t></a:r>';
const paragraph = (runs: string) => `<a:p><a:pPr algn="l"/>${runs}<a:endParaRPr lang="zh-CN"/></a:p>`;
const shape = (paragraphs: string, id = '2') => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
const slide = (shapes: string) => `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;
const untouchedShape = shape(paragraph('<a:r><a:rPr sz="1800"/><a:t>Keep exactly &amp; unchanged</a:t></a:r>'), '9');
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

async function makeRich(content = paragraph(before + tail), ordered = false): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('ppt/slides/slide1.xml', slide(shape(content) + untouchedShape));
  zip.file('ppt/slides/slide2.xml', slide(shape(paragraph('<a:r><a:rPr sz="2800"/><a:t>Second slide</a:t></a:r>'))));
  zip.file('ppt/media/opaque.bin', Buffer.from([0, 1, 2, 255, 128]));
  if (ordered) {
    zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="s2"/><p:sldId id="257" r:id="s1"/></p:sldIdLst></p:presentation>`);
    zip.file('ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="s1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="s2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>');
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
async function part(buffer: Buffer, name = 'ppt/slides/slide1.xml'): Promise<string> {
  return (await JSZip.loadAsync(buffer)).file(name)!.async('string');
}
// Independent ZIP/OOXML readback, not the editor's XML span implementation.
function textReadback(xml: string): string {
  const first = /<p:sp>[\s\S]*?<\/p:sp>/.exec(xml)![0];
  return [...first.matchAll(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g)].map(p => [...p[0].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(t => t[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))).replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))).join('')).join('\n');
}
async function assertSameParts(a: Buffer, b: Buffer, except = new Set<string>()): Promise<void> {
  const z1 = await JSZip.loadAsync(a), z2 = await JSZip.loadAsync(b);
  assert.deepEqual(Object.keys(z1.files), Object.keys(z2.files));
  for (const name of Object.keys(z1.files)) if (!z1.files[name].dir && !except.has(name)) {
    assert.equal(digest(await z1.files[name].async('nodebuffer')), digest(await z2.files[name].async('nodebuffer')), name);
  }
}

test('whole-shape replacement removes every old run and revert restores exact rich XML bytes', async () => {
  const original = await makeRich(), xml = await part(original);
  const edited = await editPptx(original, [{ slide: 1, target: 0, text: '新标题 <v2> & 完整', expectedOldText: 'Old & Tail' }]);
  assert.equal(edited.result.ok, true, edited.result.error);
  const changed = await part(edited.buffer);
  assert.equal(textReadback(changed), '新标题 <v2> & 完整');
  assert.ok(changed.includes('<a:rPr b="1" i="1" sz="1800"/>'), 'run properties remain');
  assert.ok(changed.includes('val="1254AA"'), 'replacement uses first run styling');
  assert.ok(changed.includes(untouchedShape), 'unselected shape bytes remain unchanged');
  assert.equal(edited.result.patches[0].oldText, 'Old & Tail');
  await assertSameParts(original, edited.buffer, new Set(['ppt/slides/slide1.xml']));
  const reverted = await revertPptx(edited.buffer, JSON.parse(JSON.stringify(edited.result.patches)));
  assert.equal(reverted.result.ok, true, reverted.result.error);
  assert.equal(await part(reverted.buffer), xml);
  await assertSameParts(original, reverted.buffer);
});

test('substring across rich runs and numeric entities preserves all unmatched text and run styles', async () => {
  const runs = '<a:r><a:rPr sz="2800"/><a:t>前缀 &amp; A&#x4E2D;</a:t></a:r><a:r><a:rPr b="1"/><a:t>文B 后缀</a:t></a:r>';
  const original = await makeRich(paragraph(runs));
  const edited = await editPptx(original, [{ slide: 1, target: 0, matchText: 'A中文B', text: '替换🚀', expectedOldText: '前缀 & A中文B 后缀' }]);
  assert.equal(edited.result.ok, true, edited.result.error);
  const xml = await part(edited.buffer);
  assert.equal(textReadback(xml), '前缀 & 替换🚀 后缀');
  assert.ok(xml.includes('<a:rPr b="1"/>'));
  assert.ok(xml.includes('<a:t xml:space="preserve"> 后缀</a:t>'));
  const reverted = await revertPptx(edited.buffer, edited.result.patches);
  assert.equal(reverted.result.ok, true, reverted.result.error);
  await assertSameParts(original, reverted.buffer);
});

test('ambiguous literal requires explicit occurrence and all replacements remain reversible', async () => {
  const original = await makeRich(paragraph('<a:r><a:rPr sz="2800"/><a:t>cat cat </a:t></a:r><a:r><a:rPr b="1"/><a:t>cat end</a:t></a:r>'));
  const ambiguous = await editPptx(original, [{ slide: 1, target: 0, matchText: 'cat', text: 'dog' }]);
  assert.equal(ambiguous.result.ok, false); assert.match(ambiguous.result.error!, /ambiguous/); assert.equal(ambiguous.buffer, original);
  const second = await editPptx(original, [{ slide: 1, target: 0, matchText: 'cat', text: 'second', occurrence: 1 }]);
  assert.equal(second.result.ok, true, second.result.error); assert.equal(textReadback(await part(second.buffer)), 'cat second cat end');
  const all = await editPptx(original, [{ slide: 1, target: 0, matchText: 'cat', text: 'x', occurrence: 'all' }]);
  assert.equal(all.result.ok, true, all.result.error); assert.equal(textReadback(await part(all.buffer)), 'x x x end');
  assert.equal(all.result.patches[0].newText, 'x x x end');
  const reverted = await revertPptx(all.buffer, all.result.patches); assert.equal(reverted.result.ok, true, reverted.result.error);
  await assertSameParts(original, reverted.buffer);
});

test('repeated cross-run matches apply once per explicit occurrence', async () => {
  const original = await makeRich(paragraph('<a:r><a:rPr sz="2800"/><a:t>ab</a:t></a:r><a:r><a:rPr b="1"/><a:t>cd ab</a:t></a:r><a:r><a:t>cd</a:t></a:r>'));
  const edited = await editPptx(original, [{ slide: 1, target: 0, matchText: 'abcd', text: '中', occurrence: 'all' }]);
  assert.equal(edited.result.ok, true, edited.result.error); assert.equal(textReadback(await part(edited.buffer)), '中 中');
  const reverted = await revertPptx(edited.buffer, edited.result.patches); assert.equal(reverted.result.ok, true, reverted.result.error);
  await assertSameParts(original, reverted.buffer);
});

test('identical match prefix/suffix retains its own style and run bytes', async () => {
  const unit = '<a:r><a:rPr i="1"/><a:t> 万元</a:t></a:r>';
  const original = await makeRich(paragraph('<a:r><a:rPr sz="2800" b="1"/><a:t>-12.5</a:t></a:r>' + unit));
  const edited = await editPptx(original, [{ slide: 1, target: 0, matchText: '-12.5 万元', text: '-8.75 万元' }]);
  assert.equal(edited.result.ok, true, edited.result.error);
  const xml = await part(edited.buffer); assert.equal(textReadback(xml), '-8.75 万元');
  assert.ok(xml.includes(unit), 'unchanged unit run is byte-for-byte preserved');
  const reverted = await revertPptx(edited.buffer, edited.result.patches); assert.equal(reverted.result.ok, true, reverted.result.error);
  await assertSameParts(original, reverted.buffer);
});

test('insertions/deletions at run boundaries preserve surrounding text without duplication', async () => {
  const original = await makeRich(paragraph('<a:r><a:rPr sz="2800"/><a:t>ab</a:t></a:r><a:r><a:rPr b="1"/><a:t>cd🚀</a:t></a:r>'));
  for (const [matchText, text, expected] of [['ab', 'abX', 'abXcd🚀'], ['cd🚀', 'Ycd🚀', 'abYcd🚀'], ['bcd', 'bXd', 'abXd🚀'], ['cd🚀', 'cd', 'abcd']]) {
    const edited = await editPptx(original, [{ slide: 1, target: 0, matchText, text }]);
    assert.equal(edited.result.ok, true, edited.result.error); assert.equal(textReadback(await part(edited.buffer)), expected);
    const reverted = await revertPptx(edited.buffer, edited.result.patches); assert.equal(reverted.result.ok, true, reverted.result.error);
    await assertSameParts(original, reverted.buffer);
  }
});

test('multi-paragraph whole replacement and empty replacement have exact readback', async () => {
  const original = await makeRich(paragraph(before + tail) + paragraph('<a:r><a:rPr b="1"/><a:t>下一段</a:t></a:r>'));
  const edited = await editPptx(original, [{ slide: 1, target: 0, text: '新的首段\r\n新的次段', expectedOldText: 'Old & Tail\n下一段' }]);
  assert.equal(edited.result.ok, true, edited.result.error); assert.equal(textReadback(await part(edited.buffer)), '新的首段\n新的次段');
  assert.ok((await part(edited.buffer)).includes('val="1254AA"'));
  const reverted = await revertPptx(edited.buffer, edited.result.patches); assert.equal(reverted.result.ok, true, reverted.result.error);
  await assertSameParts(original, reverted.buffer);
  const empty = await editPptx(original, [{ slide: 1, target: 0, text: '' }]);
  assert.equal(empty.result.ok, true, empty.result.error); assert.equal(textReadback(await part(empty.buffer)), '');
});

test('substring all works across paragraphs and preserves paragraph properties', async () => {
  const original = await makeRich(paragraph('<a:r><a:rPr sz="2800"/><a:t>text A</a:t></a:r>') + paragraph('<a:r><a:rPr b="1"/><a:t>text B</a:t></a:r>'));
  const edited = await editPptx(original, [{ slide: 1, target: 0, matchText: 'text', text: '修改', occurrence: 'all' }]);
  assert.equal(edited.result.ok, true, edited.result.error); assert.equal(textReadback(await part(edited.buffer)), '修改 A\n修改 B');
  assert.equal(((await part(edited.buffer)).match(/<a:pPr algn="l"\/>/g) ?? []).length, 3);
});

test('sequential patches on the same slide restore exact original and can redo', async () => {
  const original = await makeRich();
  const edited = await editPptx(original, [{ slide: 1, target: 0, text: 'first' }, { slide: 1, target: 0, text: 'second', expectedOldText: 'first' }]);
  assert.equal(edited.result.ok, true, edited.result.error);
  const reverted = await revertPptx(edited.buffer, edited.result.patches); assert.equal(reverted.result.ok, true, reverted.result.error);
  await assertSameParts(original, reverted.buffer);
  const redone = await revertPptx(reverted.buffer, reverted.result.patches); assert.equal(redone.result.ok, true, redone.result.error);
  await assertSameParts(edited.buffer, redone.buffer);
});

test('failed later operation is atomic and never reports successful partial edits', async () => {
  const original = await makeRich();
  const result = await editPptx(original, [{ slide: 1, target: 0, text: 'first' }, { slide: 1, target: 0, text: 'bad', expectedOldText: 'other' }]);
  assert.equal(result.result.ok, false); assert.equal(result.buffer, original);
  assert.deepEqual(result.result.changed, []); assert.deepEqual(result.result.patches, []);
});

test('revert refuses concurrent target changes even if visible text still matches', async () => {
  const edited = await editPptx(await makeRich(), [{ slide: 1, target: 0, text: 'New' }]);
  const zip = await JSZip.loadAsync(edited.buffer);
  zip.file('ppt/slides/slide1.xml', (await part(edited.buffer)).replace('1254AA', 'FF0000'));
  const concurrent = await zip.generateAsync({ type: 'nodebuffer' });
  const result = await revertPptx(concurrent, edited.result.patches);
  assert.equal(result.result.ok, false); assert.match(result.result.error!, /Concurrent change/); assert.equal(result.buffer, concurrent);
});

test('revert preserves concurrent changes to an unrelated package part', async () => {
  const edited = await editPptx(await makeRich(), [{ slide: 1, target: 0, text: 'New' }]);
  const zip = await JSZip.loadAsync(edited.buffer); zip.file('ppt/media/opaque.bin', 'other change');
  const result = await revertPptx(await zip.generateAsync({ type: 'nodebuffer' }), edited.result.patches);
  assert.equal(result.result.ok, true, result.result.error);
  assert.equal(await (await JSZip.loadAsync(result.buffer)).file('ppt/media/opaque.bin')!.async('string'), 'other change');
});

test('tampered and legacy patches are refused without modifying input', async () => {
  const edited = await editPptx(await makeRich(), [{ slide: 1, target: 0, text: 'New' }]);
  const tampered = structuredClone(edited.result.patches); tampered[0].snapshot!.beforeXml += 'x';
  const bad = await revertPptx(edited.buffer, tampered); assert.equal(bad.result.ok, false); assert.equal(bad.buffer, edited.buffer);
  const legacy = await revertPptx(edited.buffer, [{ slide: 1, target: 0, oldText: 'x', newText: 'New' }]);
  assert.equal(legacy.result.ok, false); assert.match(legacy.result.error!, /legacy/);
});

test('slideshow relationship order takes precedence over part numbering', async () => {
  const original = await makeRich(undefined, true), edited = await editPptx(original, [{ slide: 1, target: 0, text: 'First shown', expectedOldText: 'Second slide' }]);
  assert.equal(edited.result.ok, true, edited.result.error);
  assert.equal(await part(edited.buffer), await part(original));
  assert.equal(textReadback(await part(edited.buffer, 'ppt/slides/slide2.xml')), 'First shown');
  assert.equal(edited.result.patches[0].snapshot!.part, 'ppt/slides/slide2.xml');
});

test('namespace aliases and attribute-bearing elements are edited with their original names', async () => {
  const original = await makeRich(); const zip = await JSZip.loadAsync(original);
  zip.file('ppt/slides/slide1.xml', (await part(original)).replace(/\bp:/g, 'pres:').replace(/xmlns:p=/g, 'xmlns:pres=').replace(/\ba:/g, 'draw:').replace(/xmlns:a=/g, 'xmlns:draw=').replace('<pres:sp>', '<pres:sp useBgFill="1">'));
  const edited = await editPptx(await zip.generateAsync({ type: 'nodebuffer' }), [{ slide: 1, target: 0, text: 'Alias & 中文' }]);
  assert.equal(edited.result.ok, true, edited.result.error);
  const xml = await part(edited.buffer); assert.ok(xml.includes('<draw:t xml:space="preserve">Alias &amp; 中文</draw:t>')); assert.ok(xml.includes('useBgFill="1"'));
});

test('empty text runs insert once and leading/trailing whitespace remains explicit', async () => {
  const original = await makeRich(paragraph('<a:r><a:rPr sz="2800"/><a:t/></a:r><a:r><a:rPr b="1"/><a:t></a:t></a:r>'));
  const edited = await editPptx(original, [{ slide: 1, target: 0, text: '  keep  ' }]);
  assert.equal(edited.result.ok, true, edited.result.error); assert.equal(textReadback(await part(edited.buffer)), '  keep  ');
  assert.ok((await part(edited.buffer)).includes('xml:space="preserve"'));
});

test('unsafe XML text, invalid targets, unsupported fields and absent substring fail closed', async () => {
  const original = await makeRich();
  const invalid: EditOp[] = [
    { slide: 0, target: 0, text: 'x' }, { slide: 1, target: -1, text: 'x' }, { slide: 1, target: 0.5, text: 'x' },
    { slide: 1, target: 0, text: '\u0001' }, { slide: 1, target: 0, text: '\uD800' },
    { slide: 1, target: 0, matchText: 'missing', text: 'x' }, { slide: 1, target: 0, matchText: 'Old', text: 'x', occurrence: 8 },
    { slide: 1, target: 0, matchText: '', text: 'x' }, { slide: 1, target: 0, matchText: 'Old', text: 'a\nb' },
  ];
  for (const op of invalid) { const result = await editPptx(original, [op]); assert.equal(result.result.ok, false, JSON.stringify(op)); assert.equal(result.buffer, original); }
  const field = await makeRich(paragraph('<a:fld id="x" type="slidenum"><a:t>1</a:t></a:fld>'));
  const result = await editPptx(field, [{ slide: 1, target: 0, text: 'x' }]); assert.equal(result.result.ok, false); assert.equal(result.buffer, field);
});

test('malformed XML outside root, unknown entities and declarations never produce successful edits', async () => {
  const original = await makeRich(), xml = await part(original);
  for (const content of [xml + 'garbage', 'garbage' + xml, xml + '<![CDATA[outside]]>', xml.replace('Old &amp;', 'Old &unknown;'), '<!DOCTYPE p:sld>' + xml]) {
    const zip = await JSZip.loadAsync(original); zip.file('ppt/slides/slide1.xml', content);
    const invalid = await zip.generateAsync({ type: 'nodebuffer' });
    const edited = await editPptx(invalid, [{ slide: 1, target: 0, text: 'replacement' }]);
    assert.equal(edited.result.ok, false); assert.equal(edited.buffer, invalid); assert.deepEqual(edited.result.changed, []);
  }
});
