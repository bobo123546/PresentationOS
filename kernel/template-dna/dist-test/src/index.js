// Template DNA（总方案 PHASE 11）：从真实 PPTX 提取视觉系统
// 提取：colors / fonts / title position / shape style / slide count / masters & layouts
import JSZip from 'jszip';
const EMU_PER_INCH = 914400;
/** 从 PPTX 文件 Buffer 提取 TemplateDNA */
export async function extractTemplateDna(pptxBuffer, source = 'unknown.pptx') {
    const zip = await JSZip.loadAsync(pptxBuffer);
    const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(bySlideNumber);
    const layoutFiles = Object.keys(zip.files).filter((n) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)).sort(bySlideNumber);
    const masterFiles = Object.keys(zip.files).filter((n) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(n)).sort(bySlideNumber);
    const colorCount = new Map();
    const fontCount = new Map();
    const titlePositions = [];
    const fillCount = new Map();
    const lineColorCount = new Map();
    const lineWidthCount = new Map();
    for (const name of slideFiles) {
        const xml = await zip.files[name].async('string');
        // colors
        for (const m of xml.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"/g)) {
            const hex = m[1].toUpperCase();
            colorCount.set(hex, (colorCount.get(hex) ?? 0) + 1);
        }
        // fills
        for (const m of xml.matchAll(/<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/g)) {
            const hex = m[1].toUpperCase();
            fillCount.set(hex, (fillCount.get(hex) ?? 0) + 1);
        }
        // line colors
        for (const m of xml.matchAll(/<a:ln[^>]*>\s*<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/g)) {
            const hex = m[1].toUpperCase();
            lineColorCount.set(hex, (lineColorCount.get(hex) ?? 0) + 1);
        }
        // line widths
        for (const m of xml.matchAll(/<a:ln w="(\d+)"/g)) {
            const w = Math.round(Number(m[1]) / 12700); // EMU->pt
            lineWidthCount.set(w, (lineWidthCount.get(w) ?? 0) + 1);
        }
        // fonts (rPr latin / endParaRPr latin) — latin 可能位于 rPr 内嵌套元素之后
        for (const m of xml.matchAll(/<(?:a:rPr|a:endParaRPr|a:defRPr)[^>]*>[\s\S]*?<a:latin typeface="([^"]+)"/g)) {
            const f = m[1];
            fontCount.set(f, (fontCount.get(f) ?? 0) + 1);
        }
        // 标题形状：slide 第一个有文本且字号>=24 的形状，取 xfrm
        const titleMatch = findTitleShape(xml);
        if (titleMatch)
            titlePositions.push(titleMatch);
    }
    const sortByCount = (arr) => arr.sort((a, b) => b.count - a.count);
    const dna = {
        schema: 'template-dna',
        version: '1',
        source,
        slideCount: slideFiles.length,
        masters: await extractNames(zip, masterFiles),
        layouts: await extractNames(zip, layoutFiles),
        colors: sortByCount([...colorCount.entries()].map(([hex, count]) => ({ hex, count }))).slice(0, 16),
        fonts: sortByCount([...fontCount.entries()].map(([name, count]) => ({ name, count }))),
        titlePositions,
        shapeStyle: {
            fills: sortByCount([...fillCount.entries()].map(([hex, count]) => ({ hex, count }))).slice(0, 8),
            lineColors: sortByCount([...lineColorCount.entries()].map(([hex, count]) => ({ hex, count }))).slice(0, 8),
            lineWidths: [...lineWidthCount.entries()].map(([width, count]) => ({ width, count })).sort((a, b) => b.count - a.count),
        },
        extractedAt: new Date().toISOString(),
    };
    return dna;
}
async function extractNames(zip, files) {
    const names = [];
    for (const f of files) {
        const xml = await zip.files[f].async('string');
        const m = /<p:cSld[^>]*name="([^"]*)"/.exec(xml);
        names.push(m ? m[1] : f);
    }
    return names;
}
function findTitleShape(xml) {
    // 简化启发式：文本形状里 rPr sz>=2400（24pt）且文本长度短
    const shapeRe = /<p:sp>[\s\S]*?<p:spPr>[\s\S]*?<a:xfrm>[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(-?\d+)" cy="(-?\d+)"\/>[\s\S]*?<\/p:spPr>[\s\S]*?<p:txBody>([\s\S]*?)<\/p:txBody>[\s\S]*?<\/p:sp>/g;
    let best = null;
    for (const m of xml.matchAll(shapeRe)) {
        const body = m[5];
        const szMatch = /sz="(\d+)"/.exec(body);
        const sz = szMatch ? Number(szMatch[1]) : 0;
        const textLen = (body.match(/<a:t>/g) ?? []).length;
        const x = Number(m[1]) / EMU_PER_INCH;
        const y = Number(m[2]) / EMU_PER_INCH;
        const w = Number(m[3]) / EMU_PER_INCH;
        const h = Number(m[4]) / EMU_PER_INCH;
        if (w <= 0 || h <= 0)
            continue;
        const score = (sz >= 2400 ? 3 : 0) + (textLen <= 3 ? 1 : 0) + (y < 2 ? 2 : 0);
        if (!best || score > best.score)
            best = { rect: { x, y, w, h }, score };
    }
    if (!best)
        return null;
    return { ...best.rect, count: 1 };
}
function bySlideNumber(a, b) {
    const na = Number(/slide(\d+)\.xml$/.exec(a)?.[1]);
    const nb = Number(/slide(\d+)\.xml$/.exec(b)?.[1]);
    return na - nb;
}
