// Run the real Office probe against a specified final artifact; retain all evidence.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const input = value('--pptx');
const output = resolve(value('--output-dir') ?? resolve(root, 'evidence/powerpoint-native-worker', `run-${Date.now()}`));
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const dotnet = process.env.DOTNET_ROOT ? resolve(process.env.DOTNET_ROOT, 'dotnet.exe') : resolve(process.env.LOCALAPPDATA, 'Microsoft/dotnet/dotnet.exe');
const project = resolve(root, 'workers/powerpoint-dotnet/src/PresentationOS.PowerPoint/PresentationOS.PowerPoint.csproj');
const dll = resolve(dirname(project), 'bin/Release/net8.0/PresentationOS.PowerPoint.Worker.dll');
let result;
try {
  if (process.platform !== 'win32') throw new Error('Native QA requires Windows and Microsoft PowerPoint');
  if (!input || !existsSync(input)) throw new Error('Usage: run-native-qa.mjs --pptx <final-file.pptx> --output-dir <new-evidence-dir>');
  if (existsSync(output)) throw new Error('Evidence directory already exists; select a new directory');
  const JSZip = createRequire(resolve(root, 'kernel/pptx-engine/package.json'))('jszip');
  const zip = await JSZip.loadAsync(readFileSync(input));
  const expected = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).length;
  mkdirSync(output, { recursive: true });
  const request = resolve(output, 'request.json');
  // Keep request.json as the only initial file for the C# boundary check.
  writeFileSync(request, JSON.stringify({ directory: output, pptx: resolve(input), expected_slides: expected }), { flag: 'wx' });
  const workerOverride = value('--worker');
  const candidateWorker = resolve(root, 'runtime/worker/PresentationOS.PowerPoint.Worker.exe');
  const bundledWorker = workerOverride ? resolve(workerOverride) : (existsSync(candidateWorker) ? candidateWorker : null);
  const started = new Date().toISOString();
  let run;
  let executedCommand;
  if (bundledWorker && existsSync(bundledWorker)) {
    executedCommand = [bundledWorker, '--native-probe', request];
    run = spawnSync(bundledWorker, ['--native-probe', request], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 180000 });
  } else {
    execFileSync(dotnet, ['build', project, '-c', 'Release', '-warnaserror', '-m:1', '-nr:false'], { cwd: root, windowsHide: true, stdio: 'inherit', timeout: 120000 });
    executedCommand = [dotnet, dll, '--native-probe', request];
    run = spawnSync(dotnet, [dll, '--native-probe', request], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 180000 });
  }
  writeFileSync(resolve(output, 'native.stdout.txt'), run.stdout ?? '');
  writeFileSync(resolve(output, 'native.stderr.txt'), run.stderr ?? '');
  const probePath = resolve(output, 'probe-result.json');
  const probe = existsSync(probePath) ? JSON.parse(readFileSync(probePath, 'utf8')) : null;
  const progressPath = resolve(output, 'probe-progress.json');
  const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, 'utf8')) : null;
  let cleanup;
  try {
    const cleanupSource = readFileSync(resolve(root, 'tools/native-qa/cleanup-owned-office.ps1'), 'utf8');
    const recordLiteral = resolve(output, 'owned-process.json').replaceAll("'", "''");
    const cleaned = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `& {\n${cleanupSource}\n} -RecordPath '${recordLiteral}'`], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    cleanup = JSON.parse(cleaned.trim());
  } catch (error) { cleanup = { status: 'CLEANUP_FAILED', cleaned: false, error: error.message }; }
  writeFileSync(resolve(output, 'cleanup-result.json'), JSON.stringify(cleanup, null, 2), { flag: 'wx' });
  const artifacts = [resolve(output, 'native-input.pptx'), resolve(output, 'native.pdf'), ...(probe?.pngs ?? []), resolve(output, 'verified-copy.pptx')];
  const filesPresent = artifacts.every(p => existsSync(p) && statSync(p).size > 100);
  const pass = run.status === 0 && probe?.operation_success === true && probe?.fonts === true && probe?.process_clean === true && probe?.pngs?.length === expected && filesPresent && cleanup.cleaned === true;
  result = { scope: 'PowerPoint open/save/close/reopen/edit/readback/PDF/PNG/font-availability/dialog-polls/process-cleanup',
    timestamp: started, input: { path: resolve(input), sha256: sha(input), slides: expected },
    command: executedCommand ?? [dotnet, dll, '--native-probe', request], exitCode: run.status, error: run.error?.message,
    pass, status: pass ? 'OPERATIONS_PASS' : 'FAILED', visualFidelity: 'REQUIRES_RENDER_REVIEW',
    artifacts: artifacts.filter(existsSync).map(path => ({ path, sha256: sha(path) })), probe, progress, cleanup };
  writeFileSync(resolve(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ pass, output, error: probe?.error ?? run.error?.message }));
  process.exitCode = pass ? 0 : 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
