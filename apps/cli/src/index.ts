#!/usr/bin/env node
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
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
    console.log(`PresentationOS ${pkg.version}\nUsage: pres compile <input> [output.pptx] | qa <input> [report.json] | audit\nOutputs are new files. Existing files are never overwritten. Native Office QA is a separate verification step.`);
    return 0;
  }
  if (argv[0] === '--version' || argv[0] === '-v') { console.log(`${pkg.name} ${pkg.version}`); return 0; }
  const [command, input, output, ...extra] = argv;
  try {
    if (command === 'audit') {
      if (input) throw new Error('audit takes no arguments');
      return childExit(spawnSync(process.execPath, [join(root, 'tools/docs-auditor/audit-docs.mjs'), root], { cwd: root, stdio: 'inherit' }));
    }
    if (!['compile', 'qa'].includes(command)) throw new Error(`Unknown command: ${command}`);
    if (!input || extra.length) throw new Error(`Usage: pres ${command} <input> [output]`);
    const source = resolve(input);
    const target = output ? resolve(output) : defaultOutput(source, command === 'compile' ? '.pptx' : '.qa.json');
    if (command === 'compile' && !target.toLowerCase().endsWith('.pptx')) throw new Error('Compile output must end in .pptx');
    const report = target.replace(/\.pptx$/i, '.loop.json');
    assertNewOutputs(source, command === 'compile' ? [target, report] : [target]);
    const script = command === 'compile' ? 'tools/revision-loop/loop-deck.mjs' : 'tools/visual-qa/qa-deck.mjs';
    return childExit(spawnSync(process.execPath, [join(root, script), source, target], { cwd: root, stdio: 'inherit' }));
  } catch (error) { console.error(`Error: ${(error as Error).message}`); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
