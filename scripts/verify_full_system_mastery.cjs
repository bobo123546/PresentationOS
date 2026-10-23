// Isolated integration smoke. Run after `pnpm -r --if-present build`.
// This does not certify semantic truth, screenshots, Office, UIA or a release.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

async function main() {
  const options = {}, args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (!['--out-dir', '--health-url'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: node scripts/verify_full_system_mastery.cjs [--out-dir PARENT] [--health-url http://127.0.0.1:PORT/api/health]');
    options[args[i].slice(2)] = args[++i];
  }
  const root = path.resolve(__dirname, '..');
  const parent = path.resolve(options['out-dir'] ?? path.join(os.tmpdir(), 'presentationos-verification'));
  fs.mkdirSync(parent, { recursive: true });
  const output = fs.mkdtempSync(path.join(parent, 'mastery-'));
  const report = { startedAt: new Date().toISOString(), output, scope: 'Generated-fixture integration smoke: OOXML content and deterministic geometry',
    native: 'NOT_ATTEMPTED', uiAutomation: 'NOT_ATTEMPTED', screenshotReconstruction: 'NOT_ATTEMPTED', releaseReadiness: 'NOT_EVALUATED', checks: [] };
  const load = name => import(pathToFileURL(path.join(root, 'kernel', name, 'dist', 'index.js')).href);
  const engine = await load('pptx-engine'), workflow = await load('workflow');
  const JSZip = createRequire(path.join(root, 'kernel', 'pptx-engine', 'package.json'))('jszip');
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
  const save = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2), { flag: 'wx' });
  let sourcePath, sourceBuffer, sourceDeck, actualSlides;
  async function check(name, run) {
    try { report.checks.push({ name, status: 'PASS', evidence: await run() }); console.log(`PASS: ${name}`); }
    catch (error) { report.checks.push({ name, status: 'FAIL', error: error.stack ?? String(error) }); console.error(`FAIL: ${name}: ${error.message}`); }
  }
  const markdown = '# 内容回读集成样例\n来源A预算为37万元。\n来源B预算为58万元。\n来源C预算为91万元。\n## 经营数据\n净利润 -12.5万元。\n累计服务 10,000家机构。';
  try {
    await check('Markdown workflow to actual PPTX content readback', async () => {
      sourcePath = path.join(output, 'source.pptx');
      const service = workflow.createTaskService({ dbPath: path.join(output, 'workflows.db') });
      let result;
      try { result = await service.compileMarkdown({ projectId: 'isolated-integration-fixture', markdown, title: '内容回读集成样例', outPptxPath: sourcePath }); }
      finally { service.close(); }
      save('compile-result.json', result); assert.equal(result.ok, true, result.error); assert.equal(result.sourceContentPreserved, true);
      sourceDeck = workflow.mdToDeck(markdown, '内容回读集成样例'); sourceBuffer = fs.readFileSync(sourcePath);
      actualSlides = await engine.readRenderedDeck(sourceBuffer);
      const text = actualSlides.flatMap(slide => slide.texts).join('\n');
      for (const literal of ['37万元', '58万元', '91万元', '-12.5万元', '10,000家']) assert.ok(text.includes(literal), `Actual PPTX lost ${literal}`);
      const parsed = await workflow.parseDocument(markdown, 'sample.md', 'markdown');
      const numericCoverage = workflow.verifyFactsPreserved(parsed.facts, text); assert.equal(numericCoverage.preserved, true);
      const verification = await engine.verifyRenderedDeck(sourcePath, sourceDeck); assert.equal(verification.ok, true, verification.missing.join('; '));
      save('actual-readback.json', { actualSlides, numericCoverage, verification, limitations: 'Numeric literal coverage is not semantic truth or zero hallucination.' });
      return { path: sourcePath, sha256: sha256(sourceBuffer), slideCount: actualSlides.length, numericCoverage };
    });
    await check('Template DNA inventory from this run generated package', async () => {
      assert.ok(sourceBuffer, 'Source generation must succeed first');
      const { extractTemplateDna } = await load('template-dna'); const dna = await extractTemplateDna(sourceBuffer, 'source.pptx');
      assert.equal(dna.slideCount, actualSlides.length); assert.ok(dna.fonts.length > 0 && dna.colors.length > 0);
      save('template-dna.json', dna); return { slideCount: dna.slideCount, fonts: dna.fonts, colors: dna.colors, scope: 'OOXML style inventory, not template reproduction' };
    });
    await check('Targeted text edit and independently hashed rollback', async () => {
      assert.ok(sourceBuffer, 'Source generation must succeed first');
      const { editPptx, revertPptx } = await load('pptx-editor');
      const edited = await editPptx(sourceBuffer, [{ slide: 1, target: 'title', expectedOldText: sourceDeck.slides[0].title, text: '独立运行中的精确修订标题' }]);
      assert.equal(edited.result.ok, true, edited.result.error); assert.equal(edited.result.nonTargetPartsVerified, true);
      const before = await JSZip.loadAsync(sourceBuffer), after = await JSZip.loadAsync(edited.buffer);
      const changed = new Set(edited.result.changed.map(item => item.file)), verifiedParts = [];
      for (const part of Object.keys(before.files).filter(part => !before.files[part].dir && !changed.has(part))) {
        assert.equal(sha256(await before.file(part).async('nodebuffer')), sha256(await after.file(part).async('nodebuffer')), `Untargeted part changed: ${part}`); verifiedParts.push(part);
      }
      assert.ok((await engine.readRenderedDeck(edited.buffer))[0].texts.join('\n').includes('独立运行中的精确修订标题'));
      fs.writeFileSync(path.join(output, 'edited.pptx'), edited.buffer, { flag: 'wx' });
      const reverted = await revertPptx(edited.buffer, edited.result.patches); assert.equal(reverted.result.ok, true, reverted.result.error);
      const restored = await JSZip.loadAsync(reverted.buffer);
      for (const part of Object.keys(before.files).filter(part => !before.files[part].dir)) assert.equal(sha256(await before.file(part).async('nodebuffer')), sha256(await restored.file(part).async('nodebuffer')), `Rollback changed part: ${part}`);
      fs.writeFileSync(path.join(output, 'reverted.pptx'), reverted.buffer, { flag: 'wx' });
      save('edit-evidence.json', { result: edited.result, verifiedParts, rollback: reverted.result, scope: 'Uncompressed OOXML part identity, not whole ZIP binary identity or native layout fidelity' });
      return { verifiedNonTargetParts: verifiedParts.length, rollback: 'All original package parts match' };
    });
    await check('Known OOXML objects through SceneIR content adapter', async () => {
      assert.ok(actualSlides, 'Source generation must succeed first');
      const { reconstructDeckFromScene, calculateSceneMetrics } = await load('scene-reconstruction');
      const elements = actualSlides[0].objects.filter(object => object.type === 'text' && object.name.startsWith('source-')).map((object, i) => ({ id: object.name, type: i === 0 ? 'heading' : 'paragraph', bounds: object.rect, text: object.text, confidence: 1, isEditable: true }));
      // Confidence denotes known OOXML input, not a vision/OCR model confidence.
      const scene = { version: '1.0.0', sourceType: 'pptx_slide', sourcePath, dimensions: { width: 13.33, height: 7.5 }, elements, metrics: calculateSceneMetrics(elements) };
      const reconstructed = reconstructDeckFromScene(scene), reconstructedPath = path.join(output, 'scene-adapter.pptx');
      await engine.renderDeck(reconstructed.deckSpec, { outPath: reconstructedPath, resolveRects: () => new Map() });
      const actual = await engine.readRenderedDeck(fs.readFileSync(reconstructedPath)), text = actual.flatMap(slide => slide.texts).join('\n');
      for (const element of elements) assert.ok(text.includes(element.text), `Scene adapter lost ${element.id}`);
      save('scene-adapter.json', { scene, reconstructed, actual, scope: 'Known object text adapter only. Screenshot detection, OCR and rendered geometric fidelity are not evaluated.' });
      return { inputObjects: elements.length, outputPath: reconstructedPath, scope: 'Known OOXML object text through SceneIR to a generated package' };
    });
    await check('Mechanical checks on final rendering commands and actual geometry', async () => {
      assert.ok(sourceDeck, 'Source generation must succeed first');
      const { runMechanicalQa } = await load('mechanical-qa');
      const scenes = engine.resolveDeckScenes(sourceDeck, { resolveRects: slide => engine.resolveLayout(slide.layout ?? workflow.layoutFor(slide)) });
      const results = scenes.map(scene => ({ slide: scene.slideId, ...runMechanicalQa({ pageWidth: 13.33, pageHeight: 7.5, rects: scene.commands.filter(command => command.role === 'content').map(command => ({ id: command.id, ...command.rect })), blocks: sourceDeck.slides[scene.index].blocks }) }));
      for (const result of results) assert.equal(result.findings.length, 0, JSON.stringify(result.findings));
      const verification = await engine.verifyRenderedDeck(sourcePath, sourceDeck, scenes); assert.equal(verification.ok, true, verification.missing.join('; '));
      save('final-command-qa.json', { scenes, results, verification });
      return { slidesChecked: results.length, scope: 'Deterministic bounds, overlap, content and actual object geometry, not font rendering or visual design acceptance' };
    });
    if (options['health-url']) await check('Optional selected local HTTP health endpoint', async () => {
      const url = new URL(options['health-url']); assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only an explicit loopback HTTP endpoint is allowed');
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' }); assert.equal(response.status, 200);
      const health = await response.json(); assert.ok(['ok', 'healthy', 'running'].includes(String(health.status).toLowerCase()));
      return { url: url.href, health, scope: 'HTTP health only, not desktop UI or packaged app validation' };
    });
    else report.checks.push({ name: 'Optional local HTTP health endpoint', status: 'NOT_ATTEMPTED', reason: 'Select an existing service using --health-url. This script does not start or stop user processes.' });
  } finally {
    report.finishedAt = new Date().toISOString(); report.ok = report.checks.every(check => check.status !== 'FAIL') && report.checks.filter(check => check.status === 'PASS').length >= 5;
    save('report.json', report); console.log(`Evidence: ${path.join(output, 'report.json')}`); console.log(`Required integration smoke: ${report.ok ? 'PASS' : 'FAIL'}; Native/UIA/release NOT_EVALUATED`);
    if (!report.ok) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error.stack ?? error); process.exitCode = 1; });
