// Compatibility entry point: use the same parser, QA and output protections as pres compile.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [input, output, explicitReport, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length || !output.toLowerCase().endsWith('.pptx')) {
  console.error('usage: node markdown-to-deck.mjs <input.md> <new-output.pptx> [new-qa-report.json]');
  process.exitCode = 2;
} else {
  // Retain the legacy default report name while delegating all writes to the
  // supported compile pipeline. It rejects source aliases and existing files.
  const report = explicitReport ?? output.replace(/\.pptx$/i, '.qa.json');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../revision-loop/loop-deck.mjs', import.meta.url)), input, output, report], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
