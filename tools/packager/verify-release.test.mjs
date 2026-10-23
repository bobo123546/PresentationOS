import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const verifier = fileURLToPath(new URL('./verify-release.mjs', import.meta.url));
function runFixture(manifest, files = []) {
  const temp = mkdtempSync(join(tmpdir(), 'presentationos-bundle-gate-'));
  const release = join(temp, 'bundle'); mkdirSync(release);
  writeFileSync(join(release, 'RELEASE_MANIFEST.json'), JSON.stringify(manifest));
  for (const [path, content] of files) writeFileSync(join(release, path), content);
  const evidence = join(temp, 'evidence');
  const run = spawnSync(process.execPath, [verifier, '--release', release, '--evidence', evidence, '--bundle-only'], { encoding: 'utf8' });
  const result = JSON.parse(readFileSync(join(evidence, 'result.json')));
  assert.ok(temp.startsWith(join(tmpdir(), 'presentationos-bundle-gate-')));
  rmSync(temp, { recursive: true, force: true });
  return { exit: run.status, result };
}
test('Release verifier rejects unknown or old hardcoded-success manifests', () => {
  const { exit, result } = runFixture({ name: 'PresentationOS', verification: { cleanMachineReady: true, factPreservation100Percent: true } });
  assert.equal(exit, 1); assert.equal(result.status, 'FAIL'); assert.equal(result.releaseReady, false);
  assert.equal(result.cleanMachine, 'NOT_VERIFIED'); assert.match(result.error, /inventory/);
});
test('Release verifier fails a modified inventory file before bootstrap', () => {
  const entries = Array.from({ length: 5 }, (_, i) => ({ path: `part-${i}`, sizeBytes: 5, sha256: '0'.repeat(64) }));
  const { exit, result } = runFixture({ name: 'PresentationOS', files: entries }, [['part-0', 'tampered']]);
  assert.equal(exit, 1); assert.match(result.error, /checksum mismatch/); assert.equal(result.releaseReady, false);
});
test('Release verifier rejects lexical traversal inventory entries', () => {
  const files = Array.from({ length: 5 }, (_, i) => ({ path: i ? `part-${i}` : '../outside', sizeBytes: 1, sha256: '0'.repeat(64) }));
  const { exit, result } = runFixture({ name: 'PresentationOS', files });
  assert.equal(exit, 1); assert.match(result.error, /Invalid inventory path/);
});
