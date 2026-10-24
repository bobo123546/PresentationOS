import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractZipEntries } from '../src/zip.js';

test('ZIP consumers may tighten but cannot disable or enlarge allocation limits', () => {
  for (const limits of [{ maxEntryBytes: 0 }, { maxEntryBytes: Infinity }, { maxTotalBytes: -1 }, { maxEntries: 0 }, { maxEntryBytes: 65*1024*1024 }, { maxTotalBytes: 257*1024*1024 }]) {
    assert.throws(() => extractZipEntries(Buffer.alloc(0), limits), /Invalid ZIP extraction limit/);
  }
});
