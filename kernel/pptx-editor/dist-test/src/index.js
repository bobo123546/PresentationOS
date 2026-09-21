// Existing PPT Editing（总方案 PHASE 12）：OOXML 级最小编辑，只改目标页
// 能力：替换指定 slide 的标题文本 / 更新某 text shape 内容；保持其它部件字节级不变。
import JSZip from 'jszip';
const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;
/** 编辑 PPTX 的指定页（只改目标 shape 文本，其它部件字节不动） */
export async function editPptx(buffer, ops) {
    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files);
    const slideFiles = files.filter((f) => SLIDE_RE.test(f)).sort((a, b) => {
        return Number(SLIDE_RE.exec(a)[1]) - Number(SLIDE_RE.exec(b)[1]);
    });
    const changed = [];
    for (const op of ops) {
        const file = slideFiles[op.slide - 1];
        if (!file) {
            return { buffer, result: { ok: false, error: `slide ${op.slide} not found`, slideFiles, changed } };
        }
        let xml = await zip.files[file].async('string');
        const newXml = applyOp(xml, op);
        if (newXml === xml) {
            return { buffer, result: { ok: false, error: `no matching text shape for op on slide ${op.slide}`, slideFiles, changed } };
        }
        zip.file(file, newXml);
        changed.push({ file, op });
    }
    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return { buffer: out, result: { ok: true, slideFiles, changed } };
}
function applyOp(xml, op) {
    // 提取所有带文本的 p:sp 块
    const spRe = /<p:sp>[\s\S]*?<p:txBody>[\s\S]*?<\/p:txBody>[\s\S]*?<\/p:sp>/g;
    const sps = [];
    for (const m of xml.matchAll(spRe)) {
        const raw = m[0];
        const szMatch = /<a:rPr[^>]*sz="(\d+)"/.exec(raw);
        sps.push({ raw, start: m.index, end: m.index + raw.length, sz: szMatch ? Number(szMatch[1]) : 0 });
    }
    let targetIdx;
    if (op.target === 'title') {
        // 第一个 sz>=2400 或 y 最小的文本形状
        const t = sps.find((s) => s.sz >= 2400) ?? sps[0];
        if (!t)
            return xml;
        targetIdx = sps.indexOf(t);
    }
    else {
        targetIdx = op.target;
    }
    const target = sps[targetIdx];
    if (!target)
        return xml;
    // 替换第一个 <a:t>...</a:t> 的文本；无 <a:t> 则在 run 里插入
    const replaced = replaceFirstText(target.raw, op.text);
    return xml.slice(0, target.start) + replaced + xml.slice(target.end);
}
function replaceFirstText(spXml, text) {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tRe = /<a:t>[\s\S]*?<\/a:t>/;
    if (tRe.test(spXml)) {
        return spXml.replace(tRe, `<a:t>${escaped}</a:t>`);
    }
    // 无文本 run：在最后一个 </a:p> 前插入 run
    const pRe = /<a:p>[\s\S]*?<\/a:p>/g;
    const ps = [...spXml.matchAll(pRe)];
    const lastP = ps[ps.length - 1];
    if (!lastP)
        return spXml;
    const run = `<a:r><a:t>${escaped}</a:t></a:r>`;
    return spXml.slice(0, lastP.index + lastP[0].length) + run + spXml.slice(lastP.index + lastP[0].length);
}
