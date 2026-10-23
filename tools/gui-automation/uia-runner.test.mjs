import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const here = dirname(fileURLToPath(import.meta.url));

test('all static control IDs and an EXE cannot become native UI acceptance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-uia-gate-'));
  try {
    const release = join(dir, 'release'); mkdirSync(join(release, 'dist/assets'), { recursive: true });
    const ids = [...readFileSync(join(here, 'ui_contract.yaml'), 'utf8').matchAll(/- id:\s*"([^"]+)"/g)].map(m => m[1]);
    writeFileSync(join(release, 'dist/assets/main.js'), JSON.stringify(ids));
    writeFileSync(join(release, 'PresentationOS.exe'), 'static fixture is never executed');
    const output = join(dir, 'evidence');
    const result = spawnSync(process.execPath, [join(here, 'uia-runner.mjs'), '--release-dir', release, '--output-dir', output], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const evidence = JSON.parse(readFileSync(join(output, 'result.json'), 'utf8'));
    assert.equal(evidence.staticChecks.passed, true);
    assert.equal(evidence.pass, false);
    assert.equal(evidence.native.status, 'NOT_VERIFIED');
    assert.ok(evidence.errors.some(error => error.includes('interactions have not been recorded')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('identical host EXEs cannot reuse GUI evidence from a different frontend bundle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-uia-binding-'));
  try {
    const release = join(dir, 'release'); mkdirSync(join(release, 'dist/assets'), { recursive: true });
    const contract = join(here, 'ui_contract.yaml');
    const ids = [...readFileSync(contract, 'utf8').matchAll(/- id:\s*"([^"]+)"/g)].map(m => m[1]);
    const exe = join(release, 'PresentationOS.exe');
    writeFileSync(exe, 'unchanged host executable');
    writeFileSync(join(release, 'dist/assets/main.js'), JSON.stringify(ids));
    writeFileSync(join(release, 'RELEASE_MANIFEST.json'), '{"frontend":"new-version"}');
    const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
    const observed = join(dir, 'old-observations.json');
    writeFileSync(observed, JSON.stringify({ driver: 'Computer Use Windows', executableSha256: hash(exe),
      contractSha256: hash(contract), bundleManifestSha256: createHash('sha256').update('{"frontend":"old-version"}').digest('hex') }));
    const output = join(dir, 'evidence');
    const run = spawnSync(process.execPath, [join(here, 'uia-runner.mjs'), '--release-dir', release, '--output-dir', output, '--observations', observed], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    const result = JSON.parse(readFileSync(join(output, 'result.json'), 'utf8'));
    assert.ok(result.errors.includes('Observations are for another bundle manifest'));
    assert.ok(!result.errors.includes('Observations are for another executable'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
