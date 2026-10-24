import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DesktopSidecarServer } from '../src-server/sidecar-server.js';

const JSZip = createRequire(import.meta.resolve('@pres/template-dna'))('jszip');
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const zip = async (entries: Record<string, string>): Promise<Buffer> => {
  const archive = new JSZip();
  for (const [name, content] of Object.entries(entries)) archive.file(name, content);
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};
async function fixture(run: (context: { root: string; post: (route: string, body: any) => Promise<{ status: number; body: any }>; base: string; restart: () => Promise<void> }) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'pres-import-'));
  const token = 'private-import-session-'.repeat(3);
  let server = new DesktopSidecarServer({ port: 0, dataRoot: root, sessionToken: token });
  let base = `http://127.0.0.1:${await server.start()}`;
  const post = async (route: string, body: unknown) => {
    const response = await fetch(base + route, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const restart = async (): Promise<void> => {
    await server.stop();
    server = new DesktopSidecarServer({ port: 0, dataRoot: root, sessionToken: token });
    base = `http://127.0.0.1:${await server.start()}`;
  };
  try { await run({ root, post, base, restart }); }
  finally { await server.stop(); rmSync(root, { recursive: true, force: true }); }
}
const payload = (filename: string, value: string | Buffer, kind = 'document') => ({ filename, base64: Buffer.from(value).toString('base64'), kind });

test('asset import authenticates and rejects malformed base64, filenames, unsupported formats and oversized input before writing', async () => {
  await fixture(async ({ root, post, base }) => {
    const unauthenticated = await fetch(base + '/api/assets/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload('test.md', '# Test')) });
    assert.equal(unauthenticated.status, 401);
    for (const body of [
      payload('../escape.md', '# Test'), payload('C:\\escape.md', '# Test'), payload('file.md:hidden', '# Test'),
      payload('CON.md', '# Test'), payload('report.pdf', '%PDF-'), payload('template.docx', 'bad', 'reference-template'),
      payload('empty.md', ' \n\t\n '), payload('empty.txt', ' \n\t\n '),
      { ...payload('test.md', '# Test'), base64: 'YR==' }, { ...payload('test.md', '# Test'), base64: '%%%=' },
      { ...payload('test.md', '# Test'), base64: 'YQ==\n' }, payload('test.md', '# Test', 'arbitrary'),
      payload('broken.docx', 'not a ZIP file'), payload('test.md', Buffer.alloc(16 * 1024 * 1024 + 1, 65)),
    ]) {
      const actual = await post('/api/assets/import', body);
      assert.equal(actual.status, 400, JSON.stringify({ filename: body.filename, error: actual.body }));
    }
    assert.equal(existsSync(join(root, 'imports')), false);
  });
});

test('all six document formats import through HTTP with exact editable body values and persisted original bytes', async () => {
  const docx = await zip({ 'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>财务报告</w:t></w:r></w:p><w:p><w:r><w:t>亏损 -12.5万元，客户10,000家。</w:t></w:r></w:p></w:body></w:document>' });
  const xlsx = await zip({
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="预算" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>指标</t></is></c><c r="B1" t="inlineStr"><is><t>数值</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>亏损</t></is></c><c r="B2"><v>-12.5</v></c></row></sheetData></worksheet>',
  });
  await fixture(async ({ post }) => {
    for (const [filename, bytes, expected] of [
      ['notes.md', '# 原始标题\n\n亏损 -12.5万元。', '-12.5万元'],
      ['notes.txt', '原始标题\n\n亏损 -12.5万元。', '-12.5万元'],
      ['notes.docx', docx, '10,000家'], ['notes.csv', '指标,数值\n亏损,-12.5万元', '-12.5万元'],
      ['notes.tsv', '指标\t数值\n亏损\t-12.5万元', '-12.5万元'], ['notes.xlsx', xlsx, '-12.5'],
    ] as Array<[string, string | Buffer, string]>) {
      const actual = await post('/api/assets/import', payload(filename, bytes));
      assert.equal(actual.status, 201, actual.body.error);
      assert.ok(actual.body.markdown.includes(expected));
      assert.equal(actual.body.asset.sha256, hash(bytes));
      assert.deepEqual(readFileSync(actual.body.asset.path), Buffer.from(bytes));
    }
  });
});

test('editable import rejects significant whitespace, pipes and multiline table cells instead of silently normalizing them', async () => {
  await fixture(async ({ root, post }) => {
    for (const csv of ['Key,Value\nA," padded "', 'Key,Value\nA,"line1\nline2"', 'Key,Value\nA,"left|right"', 'Key,Value\n---,---']) {
      const result = await post('/api/assets/import', payload('unsafe-editor.csv', csv));
      assert.equal(result.status, 400);
      assert.match(result.body.error, /without changing/);
    }
    assert.equal(existsSync(join(root, 'imports')), false);
  });
});

test('identical concurrent imports share immutable storage while changed bytes produce another hash and never overwrite corruption', async () => {
  await fixture(async ({ post }) => {
    const [a, b] = await Promise.all([post('/api/assets/import', payload('same.md', '# A')), post('/api/assets/import', payload('renamed.md', '# A'))]);
    assert.equal(a.status, 201); assert.equal(b.status, 201); assert.equal(a.body.asset.path, b.body.asset.path);
    const changed = await post('/api/assets/import', payload('same.md', '# B'));
    assert.equal(changed.status, 201); assert.notEqual(changed.body.asset.path, a.body.asset.path);
    writeFileSync(a.body.asset.path, 'user replacement');
    const rejected = await post('/api/assets/import', payload('same.md', '# A'));
    assert.equal(rejected.status, 400); assert.match(rejected.body.error, /content-addressed/);
    assert.equal(readFileSync(a.body.asset.path, 'utf8'), 'user replacement');
  });
});

test('imported document and reference theme survive server restart and compile the exact original bytes with recorded hashes', async () => {
  await fixture(async ({ root, post, restart }) => {
    const source = await post('/api/assets/import', payload('财务.csv', '指标,金额\n收入,100万元\n成本,50万元'));
    assert.equal(source.status, 201, source.body.error);
    const referencePath = join(root, 'reference.pptx');
    const baseline = await post('/api/project/compile', { projectId: 'theme', title: 'Theme', markdown: '# Theme\n\nReference body.', outPptxPath: referencePath });
    assert.equal(baseline.body.ok, true, baseline.body.error);
    const reference = await post('/api/assets/import', payload('reference.pptx', readFileSync(referencePath), 'reference-template'));
    assert.equal(reference.status, 201, reference.body.error); assert.equal(reference.body.scope, 'theme-colors-and-fonts');
    const created = await post('/api/project/new', { projectId: 'profile', title: '财务', content: source.body.markdown });
    assert.equal(created.status, 201); assert.equal(created.body.project.version, '1.1.0');
    const project = { ...created.body.project, compileProfile: { sourceAsset: { ...source.body.asset, markdownSha256: hash(source.body.markdown) }, referenceAsset: reference.body.asset } };
    const projectJsonPath = join(root, 'projects', 'profile', 'pres-project.json');
    assert.equal((await post('/api/project/save', { project, projectJsonPath })).status, 200);
    await restart();
    const opened = await post('/api/project/open', { projectJsonPath });
    assert.equal(opened.status, 200); assert.deepEqual(opened.body.project.compileProfile, project.compileProfile);
    const compiled = await post('/api/project/compile', { projectId: 'profile', title: '财务', markdown: '', sourceDocumentPath: source.body.asset.path,
      sourceAssetSha256: source.body.asset.sha256, referencePptxPath: reference.body.asset.path, referenceAssetSha256: reference.body.asset.sha256,
      outPptxPath: join(root, 'profile-output.pptx') });
    assert.equal(compiled.status, 200); assert.equal(compiled.body.ok, true, compiled.body.error);
    assert.equal(compiled.body.summary.sourceProfile.sha256, source.body.asset.sha256);
    assert.equal(compiled.body.summary.designProfile.sha256, reference.body.asset.sha256);
    assert.equal(compiled.body.summary.contentVerification.ok, true);
  });
});

test('save and compile reject edited source bindings, changed asset bytes, missing hashes, path escape and unexpected profile fields', async () => {
  await fixture(async ({ root, post }) => {
    const imported = await post('/api/assets/import', payload('source.md', '# Original\n\nRevenue 100万元。'));
    const asset = imported.body.asset, markdown = imported.body.markdown;
    const created = await post('/api/project/new', { projectId: 'binding', title: 'Binding', content: markdown });
    const profile = { sourceAsset: { ...asset, markdownSha256: hash(markdown) } }, projectJsonPath = join(root, 'binding.json');
    const project = { ...created.body.project, compileProfile: profile };
    assert.equal((await post('/api/project/save', { project, projectJsonPath })).status, 200);
    const edited = structuredClone(project); edited.sourceDocument.content = '# Edited\n\nRevenue 50万元。'; edited.compileProfile.sourceAsset.markdownSha256 = hash(edited.sourceDocument.content);
    const editResult = await post('/api/project/save', { project: edited, projectJsonPath });
    assert.equal(editResult.status, 400); assert.match(editResult.body.error, /clear sourceAsset/);
    assert.equal((await post('/api/project/save', { project: { ...project, compileProfile: { ...profile, injected: true } }, projectJsonPath })).status, 400);
    const compile = { projectId: 'binding', markdown: '', sourceDocumentPath: asset.path, sourceAssetSha256: asset.sha256, outPptxPath: join(root, 'should-not-exist.pptx') };
    assert.equal((await post('/api/project/compile', { ...compile, sourceAssetSha256: undefined })).status, 400);
    assert.equal((await post('/api/project/compile', { ...compile, markdown: '# Ambiguous' })).status, 400);
    assert.equal((await post('/api/project/compile', { ...compile, sourceDocumentPath: join(root, '..', 'outside.md') })).status, 400);
    writeFileSync(asset.path, '# Changed after upload');
    assert.equal((await post('/api/project/compile', compile)).status, 400);
    assert.equal((await post('/api/project/open', { projectJsonPath })).status, 404);
    assert.equal(existsSync(compile.outPptxPath), false);
  });
});

test('project 1.0.0 remains readable but cannot smuggle a 1.1 compile profile', async () => {
  await fixture(async ({ root, post }) => {
    const created = await post('/api/project/new', { projectId: 'legacy', title: 'Legacy' });
    const legacy = { ...created.body.project, version: '1.0.0' }, projectJsonPath = join(root, 'legacy.json');
    writeFileSync(projectJsonPath, JSON.stringify(legacy));
    assert.equal((await post('/api/project/open', { projectJsonPath })).status, 200);
    assert.equal((await post('/api/project/save', { project: legacy, projectJsonPath })).status, 200);
    assert.equal(JSON.parse(readFileSync(projectJsonPath, 'utf8')).version, '1.1.0');
    writeFileSync(projectJsonPath, JSON.stringify({ ...legacy, compileProfile: {} }));
    assert.equal((await post('/api/project/open', { projectJsonPath })).status, 404);
  });
});

test('imports refuse a junction to another directory and do not write through it', async () => {
  await fixture(async ({ root, post }) => {
    const outside = mkdtempSync(join(tmpdir(), 'pres-import-outside-'));
    try {
      mkdirSync(join(root, 'imports'));
      symlinkSync(outside, join(root, 'imports', 'document'), process.platform === 'win32' ? 'junction' : 'dir');
      const actual = await post('/api/assets/import', payload('source.md', '# Boundary'));
      assert.equal(actual.status, 400); assert.match(actual.body.error, /links|junctions/);
      assert.equal(existsSync(join(outside, `${hash('# Boundary')}.md`)), false);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
});
