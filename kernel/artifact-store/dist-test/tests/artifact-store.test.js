import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArtifactStore } from '../src/index.js';
function freshStore() {
    const dir = mkdtempSync(join(tmpdir(), 'pres-artifact-'));
    return { store: new ArtifactStore(dir), dir };
}
test('put and read round-trip', () => {
    const { store, dir } = freshStore();
    try {
        const meta = store.put('hello world', { originalName: 'hello.txt', contentType: 'text/plain' });
        assert.match(meta.ref, /^sha256:/);
        assert.equal(meta.size, 11);
        assert.equal(meta.contentType, 'text/plain');
        const buf = store.read(meta.ref);
        assert.equal(buf.toString(), 'hello world');
        assert.ok(existsSync(store.filePathFor(meta.ref)));
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('dedupe: same content returns same ref', () => {
    const { store, dir } = freshStore();
    try {
        const a = store.put('same bytes');
        const b = store.put('same bytes');
        assert.equal(a.ref, b.ref);
        assert.equal(store.list().length, 1);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('list with filters', () => {
    const { store, dir } = freshStore();
    try {
        store.put('a', { capabilityId: 'cap.one', workflowRunId: 'wf-1' });
        store.put('b', { capabilityId: 'cap.two', workflowRunId: 'wf-1' });
        assert.equal(store.list({ workflowRunId: 'wf-1' }).length, 2);
        assert.equal(store.list({ capabilityId: 'cap.one' }).length, 1);
        assert.equal(store.list().length, 2);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('index survives restart (append-only jsonl reload)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pres-artifact-'));
    try {
        const s1 = new ArtifactStore(dir);
        const meta = s1.put('persisted data', { workflowRunId: 'wf-9' });
        const s2 = new ArtifactStore(dir); // 重新打开
        const rec = s2.get(meta.ref);
        assert.ok(rec);
        assert.equal(rec.meta.size, 14);
        assert.equal(readFileSync(join(dir, 'index.jsonl'), 'utf8').split('\n').filter(Boolean).length, 1);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('unknown ref returns null', () => {
    const { store, dir } = freshStore();
    try {
        assert.equal(store.get('sha256:0000000000000000000000000000000000000000000000000000000000000000'), null);
        assert.equal(store.read('nope'), null);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
