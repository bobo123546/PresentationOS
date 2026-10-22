// deck.render 能力实现：Markdown → (可选参考模板 DNA) → PPTX，含 Mechanical QA
// 跨包引用统一基于仓库根绝对路径；仓库根从本包 package.json 名定位（dist/dist-test 均可）
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = findRepoRoot(__dirname);
function findRepoRoot(start) {
    let d = start;
    for (let i = 0; i < 12; i++) {
        const pkg = join(d, 'package.json');
        if (existsSync(pkg)) {
            try {
                const j = JSON.parse(readFileSync(pkg, 'utf8'));
                if (j.name === '@pres/skill-runtime')
                    return resolve(d, '../..');
            }
            catch { /* ignore */ }
        }
        const parent = dirname(d);
        if (parent === d)
            break;
        d = parent;
    }
    throw new Error('repo root not found');
}
const DYNAMIC_IMPORTS = {
    templateDna: () => import('@pres/template-dna'),
    pptxEngine: () => import('@pres/pptx-engine'),
    mechanicalQa: () => import('@pres/mechanical-qa'),
    md2deck: () => import(pathToFileURL(join(REPO_ROOT, 'tools/vertical-slice/md2deck.mjs')).href),
};
export async function renderMarkdownDeck(markdown, outPath, reference, title) {
    try {
        mkdirSync(dirname(outPath), { recursive: true });
        const { extractTemplateDna } = await DYNAMIC_IMPORTS.templateDna();
        const { resolveLayout, renderDeck } = await DYNAMIC_IMPORTS.pptxEngine();
        const { runMechanicalQa } = await DYNAMIC_IMPORTS.mechanicalQa();
        const { mdToDeck, layoutFor } = await DYNAMIC_IMPORTS.md2deck();
        const deck = mdToDeck(markdown, title ?? 'deck');
        const rectsCache = new Map();
        const resolveRects = (slide) => {
            if (!rectsCache.has(slide.id))
                rectsCache.set(slide.id, resolveLayout(layoutFor(slide)));
            return rectsCache.get(slide.id);
        };
        // Mechanical QA
        for (const slide of deck.slides) {
            const rects = resolveRects(slide);
            const items = [];
            for (let i = 0; i < slide.blocks.length; i++) {
                const r = rects.get(`block-${i}`);
                if (r)
                    items.push({ id: `block-${i}`, ...r });
            }
            const qa = runMechanicalQa({ pageWidth: 13.33, pageHeight: 7.5, rects: items, blocks: slide.blocks.map((b, i) => ({ id: `block-${i}`, ...b })) });
            if (!qa.ok) {
                return { ok: false, error: `mechanical QA failed on ${slide.id}: ${JSON.stringify(qa.findings)}`, qaArtifacts: [] };
            }
        }
        // DNA（可选）
        let dna;
        if (reference) {
            const d = await extractTemplateDna(readFileSync(reference), reference);
            dna = { accent: pickAccent(d.colors), fontFamily: d.fonts[0]?.name ?? 'Segoe UI' };
        }
        await renderDeck(deck, { outPath, resolveRects, dna });
        return { ok: true, qaArtifacts: [] };
    }
    catch (e) {
        return { ok: false, error: e.message, qaArtifacts: [] };
    }
}
function pickAccent(colors) {
    const neutral = new Set(['FFFFFF', 'F9FAFB', 'F3F4F6', 'F8FAFC', 'E5E7EB', 'D1D5DB', '9CA3AF', '6B7280', '111827', '1F2937', '374151', '4B5563']);
    for (const c of colors)
        if (!neutral.has(c.hex))
            return c.hex;
    return colors[0]?.hex ?? '2563EB';
}
