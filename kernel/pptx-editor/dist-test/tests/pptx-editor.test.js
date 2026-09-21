import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { editPptx } from '../src/index.js';
async function makePptx() {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>');
    zip.file('ppt/slides/slide1.xml', `<?xml version="1.0"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<p:cSld><p:spTree>
<p:sp><p:txBody><a:p><a:r><a:rPr sz="2800"/><a:t>Old Title</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:txBody><a:p><a:r><a:rPr sz="1800"/><a:t>Body one</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`);
    zip.file('ppt/slides/slide2.xml', `<?xml version="1.0"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide Two</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
    return zip.generateAsync({ type: 'nodebuffer' });
}
test('replace title text of slide 1, other slides untouched', async () => {
    const buf = await makePptx();
    const { buffer, result } = await editPptx(buf, [{ slide: 1, target: 'title', text: 'New Title <v2>' }]);
    assert.equal(result.ok, true);
    const zip = await JSZip.loadAsync(buffer);
    const s1 = await zip.files['ppt/slides/slide1.xml'].async('string');
    const s2 = await zip.files['ppt/slides/slide2.xml'].async('string');
    assert.ok(s1.includes('New Title &lt;v2&gt;'));
    assert.ok(!s1.includes('Old Title'));
    assert.ok(s1.includes('Body one'));
    assert.ok(s2.includes('Slide Two'));
});
test('edit body text by index', async () => {
    const buf = await makePptx();
    const { buffer, result } = await editPptx(buf, [{ slide: 1, target: 1, text: 'Body edited' }]);
    assert.equal(result.ok, true);
    const zip = await JSZip.loadAsync(buffer);
    const s1 = await zip.files['ppt/slides/slide1.xml'].async('string');
    assert.ok(s1.includes('Body edited'));
    assert.ok(s1.includes('Old Title'));
});
test('missing slide returns error', async () => {
    const buf = await makePptx();
    const { result } = await editPptx(buf, [{ slide: 9, target: 'title', text: 'x' }]);
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /not found/);
});
test('no matching shape returns error', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:a="a"><p:cSld><p:spTree/></p:cSld></p:sld>');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const { result } = await editPptx(buf, [{ slide: 1, target: 'title', text: 'x' }]);
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /no matching/);
});
