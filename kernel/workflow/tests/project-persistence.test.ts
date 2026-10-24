import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTaskService } from '../src/index.js';

const document = { filename: 'source.md', format: 'markdown', content: '# 原始内容\n收入100万元。' };

test('creating a new project never replaces an existing project file, including the same ID', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pres-project-create-')), service = createTaskService({ dbPath: join(root, 'workflow.db') });
  try {
    const projectDir = join(root, 'same-title');
    await service.createProject({ projectId: 'original', title: 'Same title', sourceDocument: document, projectDir });
    const path = join(projectDir, 'pres-project.json'), before = readFileSync(path);
    for (const projectId of ['different-project', 'original']) {
      await assert.rejects(service.createProject({ projectId, title: 'Same title', sourceDocument: { ...document, content: '# Replacement' }, projectDir }), /already exists/);
      assert.deepEqual(readFileSync(path), before);
    }
  } finally { service.close(); rmSync(root, { recursive: true, force: true }); }
});

test('save refuses a different project identity at a same-title path and preserves every existing byte', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pres-project-id-')), service = createTaskService({ dbPath: join(root, 'workflow.db') });
  try {
    const first = await service.createProject({ projectId: 'first', title: 'Same title', sourceDocument: document });
    const second = await service.createProject({ projectId: 'second', title: 'Same title', sourceDocument: document });
    const path = join(root, 'pres-project.json');
    await service.saveProject(first, path);
    const before = readFileSync(path), secondBefore = structuredClone(second);
    await assert.rejects(service.saveProject(second, path), /identity mismatch/);
    assert.deepEqual(readFileSync(path), before);
    assert.deepEqual(second, secondBefore, 'A rejected save must not mutate the caller timestamps or version');
  } finally { service.close(); rmSync(root, { recursive: true, force: true }); }
});

test('an opened same-ID project can be updated and reopens as a complete valid document', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pres-project-update-')), service = createTaskService({ dbPath: join(root, 'workflow.db') });
  try {
    await service.createProject({ projectId: 'original', title: 'Before', sourceDocument: document, projectDir: root });
    const path = join(root, 'pres-project.json'), loaded = await service.openProject(path);
    loaded.title = 'After'; loaded.sourceDocument.content = '# 更新\n成本50万元。';
    await service.saveProject(loaded, path);
    const reopened = await service.openProject(path);
    assert.equal(reopened.projectId, 'original'); assert.equal(reopened.title, 'After');
    assert.equal(reopened.sourceDocument.content, loaded.sourceDocument.content);
    assert.equal(reopened.version, '1.1.0');
    assert.equal(readdirSync(root).some(name => name.startsWith('.pres-project-save-')), false, 'Successful saves do not accumulate recovery files');
  } finally { service.close(); rmSync(root, { recursive: true, force: true }); }
});

test('save preserves malformed JSON and schema-invalid existing files instead of replacing them', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pres-project-invalid-')), service = createTaskService({ dbPath: join(root, 'workflow.db') });
  try {
    const project = await service.createProject({ projectId: 'original', title: 'Valid', sourceDocument: document });
    for (const [name, bytes] of [['broken.json', Buffer.from('{user incomplete JSON\u0000')], ['non-project.json', Buffer.from(JSON.stringify({ projectId: 'original', userData: '保留' }))]] as const) {
      const path = join(root, name); writeFileSync(path, bytes, { flag: 'wx' });
      await assert.rejects(service.saveProject(project, path), /not valid project JSON|invalid project schema/);
      assert.deepEqual(readFileSync(path), bytes);
    }
  } finally { service.close(); rmSync(root, { recursive: true, force: true }); }
});

test('save refuses directory and junction destinations without changing the project stored beneath them', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pres-project-link-')), service = createTaskService({ dbPath: join(root, 'workflow.db') });
  try {
    const project = await service.createProject({ projectId: 'original', title: 'Keep', sourceDocument: document, projectDir: root });
    const original = join(root, 'pres-project.json'), bytes = readFileSync(original), alias = join(root, 'alias.json');
    symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    project.title = 'Must not write through link';
    await assert.rejects(service.saveProject(project, root), /non-regular|symbolic link/);
    await assert.rejects(service.saveProject(project, alias), /non-regular|symbolic link/);
    assert.deepEqual(readFileSync(original), bytes);
  } finally { service.close(); rmSync(root, { recursive: true, force: true }); }
});
