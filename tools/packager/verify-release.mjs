import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = key => { const at = args.indexOf(key); return at < 0 ? undefined : args[at + 1]; };
const release = resolve(option('--release') ?? join(root, 'release/PresentationOS'));
const evidence = resolve(option('--evidence') ?? join(root, 'evidence', `bundle-${Date.now()}`));
if (existsSync(evidence)) throw new Error('Evidence directory already exists; refusing to overwrite a previous verification.');
mkdirSync(evidence, { recursive: true });
const result = { status: 'FAIL', release, recordedAt: new Date().toISOString(), checks: [], releaseReady: false, cleanMachine: 'NOT_VERIFIED', windowsUI: 'NOT_ATTEMPTED', nativeQA: 'NOT_ATTEMPTED' };
try {
  const manifest = JSON.parse(readFileSync(join(release, 'RELEASE_MANIFEST.json'), 'utf8'));
  if (manifest.name !== 'PresentationOS' || !Array.isArray(manifest.files) || manifest.files.length < 5) throw new Error('Missing or invalid file inventory');
  const paths = new Set();
  for (const file of manifest.files) {
    const path = resolve(release, file.path), rel = relative(release, path);
    if (isAbsolute(rel) || rel.startsWith('..') || paths.has(file.path)) throw new Error(`Invalid inventory path: ${file.path}`);
    paths.add(file.path);
    if (!existsSync(path) || lstatSync(path).isSymbolicLink() || statSync(path).size !== file.sizeBytes || createHash('sha256').update(readFileSync(path)).digest('hex') !== file.sha256) throw new Error(`Bundle checksum mismatch: ${file.path}`);
  }
  function rejectLinks(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isSymbolicLink()) throw new Error('Bundle must not contain links'); if (entry.isDirectory()) rejectLinks(path); else if (!paths.has(relative(release, path).replaceAll('\\', '/')) && !['RELEASE_MANIFEST.json', 'SHA256SUMS.txt'].includes(relative(release, path))) throw new Error(`Uninventoried bundle file: ${path}`); } }
  rejectLinks(release);
  for (const required of ['PresentationOS.exe', 'runtime/node.exe', 'runtime/ffmpeg.exe', 'runtime/ffprobe.exe', 'dist/index.html', 'dist-server/sidecar-server.js', 'schemas/project/project.schema.json', 'Install.ps1', 'Uninstall.ps1']) {
    if (!existsSync(join(release, required)) || !paths.has(required)) throw new Error(`Required bundled file missing or untracked: ${required}`);
  }
  result.checks.push({ check: 'manifest-file-size-and-sha256', status: 'PASS', files: manifest.files.length });
  const env = { ...process.env, PATH: join(process.env.SystemRoot ?? 'C:/Windows', 'System32'), PRES_DATA_DIR: join(evidence, 'data'), PRES_BOOT_REPORT: join(evidence, 'bootstrap.json') };
  delete env.NODE_PATH; delete env.NODE_OPTIONS; delete env.PRES_SESSION_TOKEN; delete env.PRES_PORT;
  const exe = join(release, 'PresentationOS.exe');
  const stdout = execFileSync(exe, ['--test-boot'], { cwd: evidence, env, timeout: 40000, encoding: 'utf8', windowsHide: true });
  writeFileSync(join(evidence, 'bootstrap-stdout.txt'), stdout);
  const boot = JSON.parse(readFileSync(env.PRES_BOOT_REPORT, 'utf8'));
  if (boot.bootstrapPassed !== true || resolve(boot.dataRoot) !== resolve(env.PRES_DATA_DIR) || String(boot.version).split('+')[0] !== manifest.version) throw new Error('Host failed authenticated isolated-data/version bootstrap');
  result.checks.push({ check: 'bundled-node-authenticated-host-bootstrap-with-no-node-on-PATH', status: 'PASS', port: boot.port, ownedSidecarPid: boot.ownedSidecarPid });
  // A portable local bootstrap is useful evidence, never a substitute for a clean Windows machine.
  result.status = args.includes('--bundle-only') ? 'PASS_SCOPED' : 'PARTIAL'; result.bundleVerified = true; result.commitHash = manifest.commitHash;
  result.scope = args.includes('--bundle-only') ? 'bundle-and-authenticated-bootstrap' : 'full-release';
  if (!args.includes('--bundle-only')) process.exitCode = 1;
  result.limitations = ['Installer lifecycle, final Windows UI interaction, clean-machine prerequisites, native Office and distribution-license review require separate evidence.'];
} catch (error) { result.error = error.message; process.exitCode = 1; }
writeFileSync(join(evidence, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
