import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesktopSidecarServer } from '../src-server/sidecar-server.js';

test('an unknown narration language is a client error before synthesis or output creation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pres-language-api-'));
  const token = 'language-validation-session-'.repeat(3);
  const server = new DesktopSidecarServer({ port: 0, dataRoot: root, sessionToken: token });
  const port = await server.start(), output = join(root, 'rejected.mp4');
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/media/generate`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slides: [], outMp4Path: output, narrationLanguage: 'guess-and-rewrite' }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json() as { error: string }).error, /zh-CN or en-US/);
    assert.equal(existsSync(output), false);
  } finally { await server.stop(); rmSync(root, { recursive: true, force: true }); }
});
