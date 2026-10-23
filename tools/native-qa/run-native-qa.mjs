// PresentationOS PowerPoint Native QA Automated Runner (P07 / TASK-0011)
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTaskService } from '../../kernel/workflow/dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..', '..');
const evidenceDir = resolve(rootDir, 'evidence', 'powerpoint-native-worker');
const probeDir = resolve(rootDir, 'temp-native-qa-' + Date.now());

console.log('=== PresentationOS PowerPoint Native QA Runner (P07) ===\n');

async function main() {
  // Step 1: Check running PowerPoint processes before start
  try {
    const psCheck = execSync('powershell -Command "Get-Process POWERPNT -ErrorAction SilentlyContinue"', { encoding: 'utf8' });
    if (psCheck.trim()) {
      console.warn('[WARN] Existing PowerPoint process detected. Preserving user process and aborting test.');
      process.exit(1);
    }
  } catch {
    // Process not found, which is clean
  }

  // Step 2: Compile a fresh 3-slide PPTX with tables and metrics
  console.log('Step 1: Compiling presentation deck...');
  const taskService = createTaskService();
  const samplePptx = resolve(probeDir, 'sample-deck.pptx');
  mkdirSync(probeDir, { recursive: true });

  const compileResult = await taskService.compileMarkdown({
    projectId: 'native-qa-deck',
    title: 'Native QA Verification Deck',
    markdown: `# Native QA Verification\n\n## 核心指标\n- 服务可用性达到 99.99%\n- 端到端响应时间 50ms\n\n## 财务概览\n| 季度 | 营收 | 达成率 |\n| Q1 | $10M | 102% |\n| Q2 | $15M | 108% |\n`,
    outPptxPath: samplePptx,
  });

  if (!compileResult.ok || !existsSync(samplePptx)) {
    throw new Error(`Failed to compile PPTX: ${compileResult.error}`);
  }
  console.log(`[PASS] Sample PPTX compiled: ${samplePptx} (${compileResult.slidesCount} slides)`);

  // Step 3: Setup isolated request directory
  const requestDir = resolve(probeDir, 'probe-run');
  mkdirSync(requestDir, { recursive: true });
  const requestPath = resolve(requestDir, 'request.json');

  const requestData = {
    directory: requestDir,
    pptx: samplePptx,
    expected_slides: compileResult.slidesCount,
  };
  writeFileSync(requestPath, JSON.stringify(requestData, null, 2), 'utf8');

  // Step 4: Run C# .NET 8 Native Probe
  console.log('\nStep 2: Activating C# .NET 8 Native Probe (Office 16 COM)...');
  const dotnetExe = process.env.DOTNET_ROOT
    ? resolve(process.env.DOTNET_ROOT, 'dotnet.exe')
    : 'C:\\Users\\29903\\AppData\\Local\\Microsoft\\dotnet\\dotnet.exe';
  const workerDll = resolve(rootDir, 'workers', 'powerpoint-dotnet', 'src', 'PresentationOS.PowerPoint', 'bin', 'Debug', 'net8.0', 'PresentationOS.PowerPoint.Worker.dll');

  if (!existsSync(workerDll)) {
    console.log('Building powerpoint-dotnet worker...');
    execSync(`"${dotnetExe}" build "${resolve(rootDir, 'workers', 'powerpoint-dotnet', 'src', 'PresentationOS.PowerPoint', 'PresentationOS.PowerPoint.csproj')}"`, { stdio: 'inherit' });
  }

  const cmd = `"${dotnetExe}" "${workerDll}" --native-probe "${requestPath}"`;
  execSync(cmd, { stdio: 'inherit' });

  // Step 5: Verify Probe Results
  const resultFile = resolve(requestDir, 'probe-result.json');
  if (!existsSync(resultFile)) {
    throw new Error(`probe-result.json not found at ${resultFile}`);
  }

  const probeResult = JSON.parse(readFileSync(resultFile, 'utf8'));
  console.log('\nStep 3: Evaluating Native QA Oracle...');
  console.log(`- Office Available: ${probeResult.office_available} (Version: ${probeResult.office_version})`);
  console.log(`- Open: ${probeResult.open}`);
  console.log(`- Save & Reopen: ${probeResult.save_reopen}`);
  console.log(`- Semantic Readback: ${probeResult.semantic}`);
  console.log(`- Editability: ${probeResult.editability}`);
  console.log(`- PDF Export: ${probeResult.pdf}`);
  console.log(`- PNG Exports: ${probeResult.pngs?.length ?? 0} slides`);
  console.log(`- Dialog Warnings: ${probeResult.dialogs?.length ?? 0}`);
  console.log(`- Overall Operation Success: ${probeResult.operation_success}`);

  if (!probeResult.operation_success) {
    throw new Error(`Native QA failed: ${probeResult.error ?? 'Unknown error'}`);
  }

  // Verify exported PDF and PNGs on disk
  const pdfFile = resolve(requestDir, 'native.pdf');
  if (!existsSync(pdfFile) || statSync(pdfFile).size < 1000) {
    throw new Error(`Generated PDF invalid or missing: ${pdfFile}`);
  }

  for (const png of probeResult.pngs) {
    if (!existsSync(png) || statSync(png).size < 500) {
      throw new Error(`Exported slide PNG invalid: ${png}`);
    }
  }

  // Step 6: Verify process cleanup
  try {
    const leftover = execSync('powershell -Command "Get-Process POWERPNT -ErrorAction SilentlyContinue"', { encoding: 'utf8' });
    if (leftover.trim()) {
      console.warn('[WARN] POWERPNT process still present after probe!');
    } else {
      console.log('[PASS] Zero orphan PowerPoint processes remaining.');
    }
  } catch {}

  // Step 7: Emit Evidence Record
  mkdirSync(evidenceDir, { recursive: true });
  const evidenceRecord = {
    feature: 'PowerPoint Native QA 9-Step Verification',
    timestamp: new Date().toISOString(),
    office_version: probeResult.office_version,
    owned_pid: probeResult.owned_pid,
    slide_count: probeResult.slide_count,
    checks: {
      open: probeResult.open,
      save_reopen: probeResult.save_reopen,
      semantic_readback: probeResult.semantic,
      editability: probeResult.editability,
      pdf_export: probeResult.pdf,
      png_export_count: probeResult.pngs?.length ?? 0,
      dialog_warnings: probeResult.dialogs?.length ?? 0,
    },
    readback_text: probeResult.readback_text,
    artifacts: [
      pdfFile,
      ...(probeResult.pngs ?? []),
    ],
    status: 'VERIFIED',
    pass: true,
  };

  const evidenceFile = resolve(evidenceDir, 'result.json');
  writeFileSync(evidenceFile, JSON.stringify(evidenceRecord, null, 2), 'utf8');
  console.log(`\n[PASS] Evidence record emitted: ${evidenceFile}`);

  // Cleanup probe dir
  try {
    rmSync(probeDir, { recursive: true, force: true });
  } catch {}

  console.log('=== PowerPoint Native QA Completed Successfully ===');
}

main().catch((err) => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
