// Validate recorded native interactions; static IDs are reported separately.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const value = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const release = resolve(value('--release-dir') ?? resolve(root, 'release/PresentationOS'));
const output = resolve(value('--output-dir') ?? resolve(root, 'evidence/gui-automation', `run-${Date.now()}`));
const contractPath = resolve(root, 'tools/gui-automation/ui_contract.yaml');
const contract = readFileSync(contractPath, 'utf8');
const ids = [...contract.matchAll(/- id:\s*"([^"]+)"/g)].map(m => m[1]);
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const exe = resolve(release, 'PresentationOS.exe');
const manifest = resolve(release, 'RELEASE_MANIFEST.json');
const assets = resolve(release, 'dist/assets');
const bundle = existsSync(assets) ? readdirSync(assets).filter(p => p.endsWith('.js')).map(p => readFileSync(resolve(assets, p), 'utf8')).join('\n') : '';
const missingIds = ids.filter(id => !bundle.includes(id));
const errors = [];
let observed = null;
const observedPath = value('--observations');
if (observedPath) {
  try { observed = JSON.parse(readFileSync(resolve(observedPath), 'utf8')); }
  catch (err) { errors.push(`Cannot read observations: ${err.message}`); }
}
if (!existsSync(exe)) errors.push('Packaged executable missing');
if (!existsSync(manifest)) errors.push('Packaged manifest missing');
if (missingIds.length) errors.push(`Static bundle IDs missing: ${missingIds.join(', ')}`);
if (!observed) errors.push('Native UI interactions have not been recorded');
else {
  if (observed.executableSha256 !== (existsSync(exe) ? sha(exe) : null)) errors.push('Observations are for another executable');
  if (!existsSync(manifest) || observed.bundleManifestSha256 !== sha(manifest)) errors.push('Observations are for another bundle manifest');
  if (observed.contractSha256 !== sha(contractPath)) errors.push('Observations are for another UI contract');
  if (!['Windows UI Automation', 'Computer Use Windows', 'Win32'].includes(observed.driver)) errors.push('Unknown native driver');
  for (const id of ids) {
    const control = observed.controls?.find(c => c.id === id);
    if (!control?.observed || control.passed !== true || !control.before || !control.after) errors.push(`No before/action/after evidence for ${id}`);
  }
  for (const scenario of ['normal', 'invalid-input', 'boundary', 'cancel-recovery', 'save-reopen', 'import-export', 'task-isolation']) {
    const check = observed.scenarios?.find(s => s.name === scenario);
    if (check?.passed !== true || !check.artifacts?.length) errors.push(`Missing native scenario: ${scenario}`);
  }
  for (const artifact of observed.artifacts ?? []) {
    if (!artifact.path || !existsSync(artifact.path) || artifact.sha256 !== sha(artifact.path)) errors.push('Observed artifact is missing or changed');
  }
  if (!observed.artifacts?.length) errors.push('No persistent native artifacts');
}
const result = { timestamp: new Date().toISOString(), scope: 'native-ui-acceptance',
  executable: { path: exe, sha256: existsSync(exe) ? sha(exe) : null }, contractSha256: sha(contractPath),
  bundleManifestSha256: existsSync(manifest) ? sha(manifest) : null,
  staticChecks: { controlsTotal: ids.length, missingIds, passed: !missingIds.length },
  native: { status: errors.length ? 'NOT_VERIFIED' : 'PASS', observations: observedPath ?? null },
  pass: errors.length === 0, errors };
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.pass ? 0 : 1;
