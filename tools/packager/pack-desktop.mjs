import { execSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, relative, basename, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { bundleDependencies } from './bundle-dependencies.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const out = resolve(option('--out') ?? join(root, 'release', `PresentationOS-${Date.now()}`));
if (existsSync(out)) throw new Error(`Refusing to overwrite an existing release: ${out}`);
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dotnet = option('--dotnet') ?? process.env.DOTNET_HOST_PATH ?? (process.env.DOTNET_ROOT ? join(process.env.DOTNET_ROOT, 'dotnet.exe') : join(homedir(), 'AppData/Local/Microsoft/dotnet/dotnet.exe'));
const node = resolve(option('--node') ?? process.execPath);
const nodeRelease = JSON.parse(execFileSync(node, ['-p', 'JSON.stringify(process.release)'], { encoding: 'utf8' }));
if (!nodeRelease.lts) throw new Error('Desktop distribution requires an LTS Node runtime. Supply --node <LTS-node.exe>; the system runtime will not be changed.');
function executable(name) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Command ${name} -ErrorAction Stop).Source`], { encoding: 'utf8', windowsHide: true }).trim();
}
const ffmpeg = option('--ffmpeg') ?? executable('ffmpeg.exe'), ffprobe = option('--ffprobe') ?? executable('ffprobe.exe');
if (!args.includes('--skip-build')) execSync('pnpm -r --if-present build', { cwd: root, stdio: 'inherit' });
mkdirSync(out, { recursive: true });
execFileSync(dotnet, ['publish', join(root, 'apps/desktop-host/PresentationOS.DesktopHost.csproj'), '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-p:PublishSingleFile=true', `-p:InformationalVersion=${metadata.version}`, `-p:Version=${metadata.version.replace(/-.*/, '')}`, '-o', out], { cwd: root, stdio: 'inherit' });
cpSync(join(root, 'apps/desktop/dist'), join(out, 'dist'), { recursive: true });
cpSync(join(root, 'apps/desktop/dist-server'), join(out, 'dist-server'), { recursive: true });
cpSync(join(root, 'schemas'), join(out, 'schemas'), { recursive: true });
cpSync(join(root, 'LICENSE'), join(out, 'LICENSE'));
writeFileSync(join(out, 'package.json'), JSON.stringify({ name: 'presentationos', version: metadata.version, private: true, type: 'module' }, null, 2));
const dependencies = bundleDependencies(join(root, 'apps/desktop'), out);
mkdirSync(join(out, 'runtime')); mkdirSync(join(out, 'third-party-notices'));
for (const [file, name] of [[node, 'node.exe'], [ffmpeg, 'ffmpeg.exe'], [ffprobe, 'ffprobe.exe']]) cpSync(file, join(out, 'runtime', name));
const nodeVersion = execFileSync(node, ['--version'], { encoding: 'utf8' }).trim();
const ffmpegVersion = execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split('\n')[0];
const ffmpegRoot = resolve(dirname(ffmpeg), '..');
for (const file of ['LICENSE', 'README.txt']) if (existsSync(join(ffmpegRoot, file))) cpSync(join(ffmpegRoot, file), join(out, 'third-party-notices', `FFmpeg-${file}`));
const suppliedLicense = option('--node-license') ?? (existsSync(join(dirname(node), 'LICENSE')) ? join(dirname(node), 'LICENSE') : undefined);
if (suppliedLicense) cpSync(suppliedLicense, join(out, 'third-party-notices/Node-LICENSE.txt'));
else {
  const license = await fetch(`https://raw.githubusercontent.com/nodejs/node/${nodeVersion}/LICENSE`);
  if (!license.ok) throw new Error(`Node license download failed (${license.status}); supply --node-license`);
  writeFileSync(join(out, 'third-party-notices/Node-LICENSE.txt'), await license.text());
}
for (const file of ['Install.ps1', 'Uninstall.ps1']) cpSync(join(here, file), join(out, file));
writeFileSync(join(out, 'BUNDLE_README.txt'), `PresentationOS ${metadata.version} Windows x64 candidate\nRun PresentationOS.exe. Microsoft Edge WebView2 Runtime is required for the desktop UI.\nOptional native PowerPoint QA requires installed Microsoft PowerPoint. Windows SAPI needs an installed speech voice.\nNode ${nodeVersion}, production JS dependencies and FFmpeg/FFprobe are included. See third-party-notices and dependency licenses.\nOptional per-user install: powershell -NoProfile -File .\\Install.ps1\nLaunch from the installation: powershell -NoProfile -File <InstallRoot>\\Launch-PresentationOS.ps1\nUpgrades keep older version directories and the existing data directory. Uninstall.ps1 preserves user data.\nThis is an alpha candidate. Clean-machine, full Windows UI and distribution/license acceptance remain separate gates.\n`);
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release contains a filesystem link: ${path}`);
    if (entry.isDirectory()) walk(path);
    else files.push({ path: relative(out, path).split(sep).join('/'), sizeBytes: statSync(path).size, sha256: sha(path) });
  }
}
walk(out); files.sort((a, b) => a.path.localeCompare(b.path));
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
const sourceSnapshot = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).split('\0').filter(Boolean).filter(path => existsSync(join(root, path)) && statSync(join(root, path)).isFile()).sort().map(path => ({ path, sha256: sha(join(root, path)) }));
const manifest = {
  name: 'PresentationOS', version: metadata.version, target: 'win-x64', releaseChannel: 'alpha-candidate',
  commitHash: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHasUncommittedChanges: dirty.length > 0, sourceDiffSha256: createHash('sha256').update(execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: root, maxBuffer: 50 * 1024 * 1024 })).digest('hex'),
  lockfileSha256: sha(join(root, 'pnpm-lock.yaml')),
  sourceSnapshotSha256: createHash('sha256').update(JSON.stringify(sourceSnapshot)).digest('hex'), sourceSnapshot,
  builtAt: new Date().toISOString(), files, dependencies, runtimes: { nodeVersion, nodeLts: nodeRelease.lts, ffmpegVersion },
  externalRequirements: ['Microsoft Edge WebView2 Runtime (desktop UI)', 'Microsoft PowerPoint (native QA only)', 'Installed Windows SAPI speech voice (narration)'],
  verification: { bundleHash: 'GENERATED', bootstrap: 'NOT_ATTEMPTED', installer: 'NOT_VERIFIED', cleanMachine: 'NOT_VERIFIED', nativeQA: 'NOT_ATTEMPTED', windowsUI: 'NOT_ATTEMPTED', distributionLicenseReview: 'NOT_VERIFIED', releaseReady: false },
};
writeFileSync(join(out, 'RELEASE_MANIFEST.json'), JSON.stringify(manifest, null, 2));
writeFileSync(join(out, 'SHA256SUMS.txt'), files.map(f => `${f.sha256}  ${f.path}`).join('\n') + '\n');
console.log(`Bundle staged with ${files.length} files and ${dependencies.length} resolved production packages at ${out}`);
console.log('Run verify-release.mjs --release <directory> --evidence <new-directory>. This build alone does not pass the release gate.');
