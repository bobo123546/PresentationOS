import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractTemplateDna } from '../src/index.js';
async function makePptx() {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>');
    zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld name="Slide 1"><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Text 0"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="548640" y="320040"/><a:ext cx="11064240" cy="731520"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="2800"><a:latin typeface="Segoe UI"/></a:rPr><a:t>Design Title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    zip.file('ppt/slides/slide2.xml', `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld name="Slide 2"><p:spTree><p:sp><p:spPr><a:solidFill><a:srgbClr val="F9FAFB"/></a:solidFill></p:spPr><p:txBody><a:p><a:r><a:rPr sz="1800"><a:latin typeface="Segoe UI"/></a:rPr><a:t>Body</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
    zip.file('ppt/slideLayouts/slideLayout1.xml', '<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Title Slide"/></p:sldLayout>');
    zip.file('ppt/slideMasters/slideMaster1.xml', '<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Office Theme"/></p:sldMaster>');
    return zip.generateAsync({ type: 'nodebuffer' });
}
test('extract colors, fonts, title position, masters/layouts from pptx', async () => {
    const buf = await makePptx();
    const dna = await extractTemplateDna(buf, 'test.pptx');
    assert.equal(dna.schema, 'template-dna');
    assert.equal(dna.slideCount, 2);
    assert.deepEqual(dna.masters, ['Office Theme']);
    assert.deepEqual(dna.layouts, ['Title Slide']);
    assert.ok(dna.colors.some((c) => c.hex === '2563EB' && c.count >= 2));
    assert.ok(dna.colors.some((c) => c.hex === 'F9FAFB'));
    assert.ok(dna.fonts.some((f) => f.name === 'Segoe UI'));
    assert.ok(dna.titlePositions.length >= 1);
    const t = dna.titlePositions[0];
    assert.ok(t.x > 0 && t.y > 0 && t.w > 0 && t.h > 0);
    assert.ok(dna.shapeStyle.fills.some((c) => c.hex === '2563EB'));
});
test('rejects non-zip buffer', async () => {
    await assert.rejects(extractTemplateDna(Buffer.from('not a zip'), 'bad.pptx'));
});
