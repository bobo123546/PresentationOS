#!/usr/bin/env node
import { createRequire } from 'node:module';
import { resolve, dirname, join, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertNewOutputs, defaultOutput } from '../../../tools/shared/io-safety.mjs';
const pkg = createRequire(import.meta.url)('../package.json') as { name: string; version: string };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export function childExit(result: { status: number | null; error?: Error; signal?: string | null }): number {
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}
export function main(argv: string[]): number {
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    console.log(`PresentationOS ${pkg.version}\nUsage: pres compile <input.md|txt|csv|tsv|docx|xlsx> [output.pptx] [--template reference.pptx] | qa <source-document> [report.json] | qa-native <final.pptx> [new-evidence-directory] | audit\nDocument import preserves supported body text and cached table values, not document styling or embedded assets.\nTemplate colors and fonts are applied; template layouts and assets are not copied.\nqa checks source preflight; it does not inspect an exported PPTX. qa-native opens the actual PPTX in Microsoft PowerPoint on Windows and requires the configured .NET SDK.\naudit checks documentation and state consistency; it does not certify product or release acceptance.\nOutputs are new files. Existing files are never overwritten.`);
    return 0;
  }
  if (argv[0] === '--version' || argv[0] === '-v') { console.log(`${pkg.name} ${pkg.version}`); return 0; }
  const [command, input, ...remaining] = argv;
  try {
    if (command === 'audit') {
      if (input) throw new Error('audit takes no arguments');
      return childExit(spawnSync(process.execPath, [join(root, 'tools/docs-auditor/audit-docs.mjs'), root], { cwd: root, stdio: 'inherit' }));
    }
    if (command === 'qa-native') {
      if (!input || remaining.length > 1 || remaining.some(arg => arg.startsWith('--')) || extname(input).toLowerCase() !== '.pptx') throw new Error('Usage: pres qa-native <final.pptx> [new-evidence-directory]');
      if (process.platform !== 'win32') throw new Error('PowerPoint native QA requires Windows and Microsoft PowerPoint');
      if (!existsSync(input)) throw new Error('Native QA input file does not exist');
      const evidence = remaining[0] ? resolve(remaining[0]) : undefined;
      if (evidence && existsSync(evidence)) throw new Error('Native QA evidence directory must be new');
      return childExit(spawnSync(process.execPath, [join(root, 'tools/native-qa/run-native-qa.mjs'), '--pptx', resolve(input), ...(evidence ? ['--output-dir', evidence] : [])], { cwd: root, stdio: 'inherit' }));
    }
    if (!['compile', 'qa'].includes(command)) throw new Error(`Unknown command: ${command}`);
    const args = [...remaining];
    const output = args[0] && !args[0].startsWith('--') ? args.shift() : undefined;
    let reference: string | undefined;
    if (args.length) {
      if (command !== 'compile' || args.length !== 2 || args[0] !== '--template' || !args[1] || args[1].startsWith('--')) throw new Error(`Usage: pres ${command} <input> [output]${command === 'compile' ? ' [--template reference.pptx]' : ''}`);
      reference = resolve(args[1]);
      if (extname(reference).toLowerCase() !== '.pptx') throw new Error('Reference template must be a .pptx file');
    }
    if (!input) throw new Error(`Usage: pres ${command} <input> [output]`);
    const source = resolve(input);
    if (command === 'compile' && !['.md', '.markdown', '.txt', '.csv', '.tsv', '.docx', '.xlsx'].includes(extname(source).toLowerCase())) throw new Error('Unsupported compile format; PDF and existing PPTX need a dedicated import adapter');
    if (command === 'qa' && !['.md', '.markdown', '.txt', '.csv', '.tsv', '.docx', '.xlsx'].includes(extname(source).toLowerCase())) throw new Error('Source QA supports MD/TXT/CSV/TSV/DOCX/XLSX. Use qa-native for an actual PPTX.');
    const target = output ? resolve(output) : defaultOutput(source, command === 'compile' ? '.pptx' : '.qa.json');
    if (command === 'compile' && !target.toLowerCase().endsWith('.pptx')) throw new Error('Compile output must end in .pptx');
    const report = target.replace(/\.pptx$/i, '.loop.json');
    assertNewOutputs(source, command === 'compile' ? [target, report] : [target]);
    if (reference) assertNewOutputs(reference, [target, report]);
    const script = command === 'compile' ? 'tools/revision-loop/loop-deck.mjs' : 'tools/visual-qa/qa-deck.mjs';
    const childArgs = [join(root, script), source, target, ...(reference ? [report, '--template', reference] : [])];
    return childExit(spawnSync(process.execPath, childArgs, { cwd: root, stdio: 'inherit' }));
  } catch (error) { console.error(`Error: ${(error as Error).message}`); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
