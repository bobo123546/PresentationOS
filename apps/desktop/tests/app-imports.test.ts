import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { appHarness } from './helpers/app-harness.js';

const response = (data: unknown, ok = true) => ({ ok, json: async () => data });
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const sourceText = '# 财务\n\n## 指标\n收入 100 万元，成本 -12.5 万元。';
const sourceAsset = { path: 'D:/isolated-data/imports/source.docx', sha256: 'a'.repeat(64), filename: '报告.docx' };
const referenceAsset = { path: 'D:/isolated-data/imports/reference.pptx', sha256: 'b'.repeat(64), filename: '主题.pptx' };
const compileResult = {
  ok: true, status: 'COMPLETED', runId: 'done', pptxPath: 'D:/isolated-data/builds/deck.pptx', reportPath: 'D:/isolated-data/builds/deck.json',
  slidesCount: 2, overallScore: 95, sourceContentPreserved: true,
  summary: { passed: true, contentVerification: { ok: true }, mechanical: { pass: true } },
};
function file(name = '报告.docx', value = 'document bytes') {
  const bytes = new TextEncoder().encode(value);
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('source trace UI requires every reference gate and readback instead of treating a general QA pass as evidence', async () => {
  const without = appHarness({ compileResult });
  await without.props('HeaderBar').onCompile();
  assert.equal(without.props('QaInspector').report.sourceTrace, undefined);
  for (const readback of ['PASS', 'NOT_ATTEMPTED']) {
    const result = { ...compileResult, summary: { ...compileResult.summary,
      sourceLedger: { chunks: [{}, {}, {}], facts: [{}, {}] },
      compiledPageMap: { pages: [{}, {}], readback: { status: readback },
        integrity: { sourceReferences: 'PASS', protectedOccurrences: 'PASS', quotationCoverage: 'PASS', tableContext: 'PASS' } },
    } };
    const app = appHarness({ compileResult: result });
    await app.props('HeaderBar').onCompile();
    assert.deepEqual(JSON.parse(JSON.stringify(app.props('QaInspector').report.sourceTrace)), {
      passed: readback === 'PASS', chunks: 3, occurrences: 2, pages: 2,
    });
  }
});

test('document and theme import feed original assets to compile, round-trip save, and detach source after editing', async () => {
  const app = appHarness({ compileResult, onRequest: (route, body) => {
    if (route === '/api/assets/import') return response(body.kind === 'document'
      ? { asset: sourceAsset, markdown: sourceText, format: 'docx' }
      : { asset: referenceAsset, scope: 'theme-colors-and-fonts' });
    if (route === '/api/project/save') return response({ success: true });
  } });
  await app.props('MarkdownEditor').onImportDocument(file());
  assert.equal(app.requests.find(request => request.route === '/api/assets/import')!.body.base64, Buffer.from('document bytes').toString('base64'));
  assert.equal(app.props('MarkdownEditor').markdown, sourceText);
  assert.equal(app.props('MarkdownEditor').sourceFilename, '报告.docx');
  await app.props('MarkdownEditor').onImportReference(file('主题.pptx'));
  await app.props('HeaderBar').onCompile();
  const originalCompile = app.requests.find(request => request.route.endsWith('/compile'))!.body;
  assert.equal(originalCompile.markdown, '');
  assert.equal(originalCompile.sourceDocumentPath, sourceAsset.path);
  assert.equal(originalCompile.sourceAssetSha256, sourceAsset.sha256);
  assert.equal(originalCompile.referencePptxPath, referenceAsset.path);
  assert.equal(originalCompile.referenceAssetSha256, referenceAsset.sha256);
  await app.props('HeaderBar').onSave();
  const saved = app.requests.filter(request => request.route.endsWith('/save')).at(-1)!.body.project;
  assert.equal(saved.version, '1.1.0');
  assert.equal(saved.compileProfile.sourceAsset.markdownSha256, digest(sourceText));
  assert.equal(saved.sourceDocument.content, sourceText);
  assert.equal(app.props('HeaderBar').hasPptx, true);
  app.props('MarkdownEditor').onMarkdownChange(sourceText + '\n修订内容');
  assert.equal(app.props('HeaderBar').hasPptx, false, 'Content edits must invalidate the old QA and artifact');
  assert.equal(app.props('MarkdownEditor').sourceFilename, undefined);
  assert.equal(app.props('MarkdownEditor').referenceFilename, '主题.pptx');
  await app.props('HeaderBar').onCompile();
  const editedCompile = app.requests.filter(request => request.route.endsWith('/compile')).at(-1)!.body;
  assert.equal(editedCompile.sourceDocumentPath, undefined);
  assert.equal(editedCompile.markdown, sourceText + '\n修订内容');
  assert.equal(editedCompile.referenceAssetSha256, referenceAsset.sha256);
});

test('import locks edits, new, open, save, second import and compilation until it succeeds', async () => {
  const pending = deferred<any>();
  const app = appHarness({ onRequest: route => route === '/api/assets/import' ? pending.promise : undefined });
  const initialMarkdown = app.props('MarkdownEditor').markdown;
  const initialTitle = app.props('HeaderBar').title;
  const importing = app.props('MarkdownEditor').onImportDocument(file());
  await new Promise(done => setImmediate(done));
  assert.equal(app.props('HeaderBar').busy, true);
  assert.equal(app.props('MarkdownEditor').disabled, true);
  await app.props('HeaderBar').onCompile();
  await app.props('HeaderBar').onOpen();
  await app.props('HeaderBar').onSave();
  app.props('HeaderBar').onNew();
  app.props('HeaderBar').onTitleChange('must not apply');
  app.props('MarkdownEditor').onMarkdownChange('must not apply');
  await app.props('MarkdownEditor').onImportReference(file('other.pptx'));
  assert.equal(app.requests.filter(request => request.route !== '/api/session').length, 1);
  assert.equal(app.props('MarkdownEditor').markdown, initialMarkdown);
  assert.equal(app.props('HeaderBar').title, initialTitle);
  pending.resolve(response({ asset: sourceAsset, markdown: sourceText, format: 'docx' }));
  await importing;
  assert.equal(app.props('HeaderBar').busy, false);
  assert.equal(app.props('MarkdownEditor').markdown, sourceText);
});

test('failed import preserves content, prior source profile and existing successful QA', async () => {
  let fail = false;
  const app = appHarness({ compileResult, onRequest: route => route === '/api/assets/import'
    ? response(fail ? { error: 'Malformed DOCX' } : { asset: sourceAsset, markdown: sourceText, format: 'docx' }, !fail) : undefined });
  await app.props('MarkdownEditor').onImportDocument(file());
  await app.props('HeaderBar').onCompile();
  fail = true;
  await app.props('MarkdownEditor').onImportDocument(file('bad.docx'));
  assert.equal(app.props('MarkdownEditor').markdown, sourceText);
  assert.equal(app.props('MarkdownEditor').sourceFilename, sourceAsset.filename);
  assert.equal(app.props('HeaderBar').hasPptx, true);
  assert.equal(app.props('HeaderBar').busy, false);
});

test('unsupported, empty and oversized input is rejected before file reading or any HTTP import', async () => {
  let read = false;
  const app = appHarness();
  for (const invalid of [{ name: 'deck.pdf', size: 1 }, { name: 'empty.docx', size: 0 }, { name: 'huge.docx', size: 16 * 1024 * 1024 + 1 }]) {
    await app.props('MarkdownEditor').onImportDocument({ ...invalid, arrayBuffer: async () => { read = true; return new ArrayBuffer(1); } });
    assert.equal(app.props('HeaderBar').busy, false);
  }
  assert.equal(read, false);
  assert.equal(app.requests.some(request => request.route === '/api/assets/import'), false);
});

test('delayed import after unmount cannot replace source or restore a binding', async () => {
  const pending = deferred<any>();
  const app = appHarness({ onRequest: route => route === '/api/assets/import' ? pending.promise : undefined });
  const before = app.props('MarkdownEditor').markdown;
  const importing = app.props('MarkdownEditor').onImportDocument(file());
  await new Promise(done => setImmediate(done));
  app.unmount();
  pending.resolve(response({ asset: sourceAsset, markdown: sourceText, format: 'docx' }));
  await importing;
  assert.equal(app.props('MarkdownEditor').markdown, before);
  assert.equal(app.props('MarkdownEditor').sourceFilename, undefined);
});

test('open restores verified v1.1 profile, while stale binding fails without replacing the current project', async () => {
  let mismatch = false;
  const project = { projectId: 'saved', createdAt: '2026-10-24T00:00:00Z', title: 'Saved document',
    version: '1.1.0', sourceDocument: { content: sourceText },
    compileProfile: { sourceAsset: { ...sourceAsset, markdownSha256: digest(sourceText) }, referenceAsset } };
  const app = appHarness({ promptResults: ['D:/isolated-data/saved.json', 'D:/isolated-data/bad.json'],
    onRequest: route => route === '/api/project/open' ? response({ project: mismatch ? { ...project, title: 'Wrong', sourceDocument: { content: 'changed' } } : project }) : undefined });
  await app.props('HeaderBar').onOpen();
  assert.equal(app.props('HeaderBar').title, 'Saved document');
  assert.equal(app.props('MarkdownEditor').sourceFilename, sourceAsset.filename);
  assert.equal(app.props('MarkdownEditor').referenceFilename, referenceAsset.filename);
  mismatch = true;
  await app.props('HeaderBar').onOpen();
  assert.equal(app.props('HeaderBar').title, 'Saved document');
  assert.equal(app.props('MarkdownEditor').markdown, sourceText);
  app.props('HeaderBar').onNew();
  assert.equal(app.props('MarkdownEditor').sourceFilename, undefined);
  assert.equal(app.props('MarkdownEditor').referenceFilename, undefined);
});

test('legacy project without compileProfile reopens and clears previous imported asset bindings', async () => {
  const app = appHarness({ promptResults: ['D:/isolated-data/legacy.json'], onRequest: route => {
    if (route === '/api/assets/import') return response({ asset: sourceAsset, markdown: sourceText, format: 'docx' });
    if (route === '/api/project/open') return response({ project: { projectId: 'old', title: 'Legacy', createdAt: '2026-10-24T00:00:00Z', version: '1.0.0', sourceDocument: { content: '# Legacy' } } });
  } });
  await app.props('MarkdownEditor').onImportDocument(file());
  await app.props('HeaderBar').onOpen();
  assert.equal(app.props('HeaderBar').title, 'Legacy');
  assert.equal(app.props('MarkdownEditor').sourceFilename, undefined);
});

test('section text detaches the original source, while project naming and section metadata keep its binding', async () => {
  const app = appHarness({ compileResult, onRequest: route => route === '/api/assets/import'
    ? response({ asset: sourceAsset, markdown: sourceText, format: 'docx' }) : undefined });
  await app.props('MarkdownEditor').onImportDocument(file());
  app.props('SlidePreview').onUpdateSlide({ speakerNotes: '演讲备注', layout: 'quote' });
  assert.equal(app.props('MarkdownEditor').sourceFilename, sourceAsset.filename);
  app.props('SlidePreview').onUpdateSlide({ title: '修订章节' });
  assert.equal(app.props('MarkdownEditor').sourceFilename, undefined);
  assert.ok(app.props('MarkdownEditor').markdown.startsWith('# 修订章节'));
  await app.props('MarkdownEditor').onImportDocument(file());
  await app.props('HeaderBar').onCompile();
  assert.equal(app.props('HeaderBar').hasPptx, true);
  app.props('HeaderBar').onTitleChange('修订项目');
  assert.equal(app.props('MarkdownEditor').sourceFilename, sourceAsset.filename);
  assert.equal(app.props('HeaderBar').hasPptx, false, 'Renaming the project invalidates old output without changing its source');
  await app.props('HeaderBar').onCompile();
  const request = app.requests.filter(request => request.route.endsWith('/compile')).at(-1)!.body;
  assert.equal(request.sourceDocumentPath, sourceAsset.path);
  assert.equal(request.markdown, '');
  assert.equal(request.title, '修订项目');
});

test('removing a reference invalidates its old output and excludes it from the next compile', async () => {
  const app = appHarness({ compileResult, onRequest: route => route === '/api/assets/import'
    ? response({ asset: referenceAsset, scope: 'theme-colors-and-fonts' }) : undefined });
  await app.props('MarkdownEditor').onImportReference(file('主题.pptx'));
  await app.props('HeaderBar').onCompile();
  assert.equal(app.props('HeaderBar').hasPptx, true);
  app.props('MarkdownEditor').onClearReference();
  assert.equal(app.props('HeaderBar').hasPptx, false);
  assert.equal(app.props('MarkdownEditor').referenceFilename, undefined);
  await app.props('HeaderBar').onCompile();
  assert.equal(app.requests.filter(request => request.route.endsWith('/compile')).at(-1)!.body.referencePptxPath, undefined);
});

test('unrecognized reference scope and malformed asset descriptors cannot replace valid project input', async () => {
  const app = appHarness({ onRequest: (route, body) => route === '/api/assets/import'
    ? response(body.kind === 'reference-template' ? { asset: referenceAsset, scope: 'full-template-replica' }
      : { asset: { ...sourceAsset, sha256: 'invalid' }, markdown: sourceText }) : undefined });
  const before = app.props('MarkdownEditor').markdown;
  await app.props('MarkdownEditor').onImportDocument(file());
  await app.props('MarkdownEditor').onImportReference(file('主题.pptx'));
  assert.equal(app.props('MarkdownEditor').markdown, before);
  assert.equal(app.props('MarkdownEditor').sourceFilename, undefined);
  assert.equal(app.props('MarkdownEditor').referenceFilename, undefined);
  assert.equal(app.props('HeaderBar').busy, false);
});

test('large outline renders only forty source entries with accessible paging and last-chapter jump', () => {
  const compiled = ts.transpileModule(readFileSync('src/components/MarkdownEditor.tsx', 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as any };
  const react = { __esModule: true, default: { createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }) } };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`) (() => react, module, module.exports);
  const slides = Array.from({ length: 20001 }, (_, index) => ({ id: `s${index}`, title: `Chapter ${index}`, bullets: [], layout: 'title' }));
  let selected = 0;
  const render = () => module.exports.MarkdownEditor({ markdown: '', slides, selectedIndex: selected, onSelectSlide: (index: number) => { selected = index; }, onImport: () => {}, onMarkdownChange: () => {}, onImportDocument: async () => {}, onImportReference: async () => {}, onClearReference: () => {} });
  const nodes = (tree: any): any[] => !tree?.props ? [] : [tree, ...(tree.props.children ?? []).flat().flatMap(nodes)];
  let treeNodes = nodes(render());
  assert.equal(treeNodes.filter(node => node.props.id?.startsWith('SlideNavItem_')).length, 40);
  treeNodes.find(node => node.props.id === 'NextOutlinePageBtn').props.onClick();
  assert.equal(selected, 40);
  treeNodes = nodes(render());
  assert.equal(treeNodes.find(node => node.props.id === 'SlideNavItem_40').props['aria-pressed'], true);
  treeNodes.find(node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: { elements: { namedItem: () => ({ value: '20001', checkValidity: () => true }) } } });
  assert.equal(selected, 20000);
  treeNodes = nodes(render());
  assert.equal(treeNodes.filter(node => node.props.id?.startsWith('SlideNavItem_')).length, 1);
  assert.equal(treeNodes.find(node => node.props.id === 'NextOutlinePageBtn').props.disabled, true);
});
