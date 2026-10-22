#!/usr/bin/env node
// PresentationOS CLI 入口
import { createRequire } from 'node:module';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../../');

function printHelp(): void {
  console.log(`
PresentationOS CLI — AI Presentation Development Platform (v${pkg.version})

Usage:
  pres <command> [options]

Commands:
  compile <input.md> [output.pptx]   Compile Markdown into PPTX with QA & Revision Loop
  audit                              Run docs, state, and schema consistency checks
  qa <input.md>                      Audit a presentation Markdown with Visual & Mechanical QA
  --version, -v                      Display CLI version
  --help, -h                         Display this help message

Examples:
  pres compile tools/vertical-slice/sample.md
  pres compile input.md D:\\PresentationOSData\\artifacts\\output.pptx
  pres audit
  pres qa tools/revision-loop/bad-demo.md
`);
}

export function main(argv: string[]): number {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return 0;
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`${pkg.name} ${pkg.version}`);
    return 0;
  }

  const [cmd, ...args] = argv;

  switch (cmd) {
    case 'compile': {
      const input = args[0];
      if (!input) {
        console.error('Error: missing required argument <input.md>');
        console.error('Usage: pres compile <input.md> [output.pptx]');
        return 1;
      }
      const absInput = resolve(process.cwd(), input);
      if (!existsSync(absInput)) {
        console.error(`Error: input file not found: ${absInput}`);
        return 1;
      }

      let absOutput: string;
      if (args[1]) {
        absOutput = resolve(process.cwd(), args[1]);
      } else {
        const outDir = join('D:', 'PresentationOSData', 'artifacts');
        mkdirSync(outDir, { recursive: true });
        absOutput = join(outDir, 'presentation_output.pptx');
      }

      const loopScript = join(REPO_ROOT, 'tools', 'revision-loop', 'loop-deck.mjs');
      console.log(`[PresentationOS] Compiling: ${absInput}`);
      console.log(`[PresentationOS] Output:    ${absOutput}`);

      const res = spawnSync(process.execPath, [loopScript, absInput, absOutput], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
      return res.status ?? 0;
    }

    case 'audit': {
      const auditorScript = join(REPO_ROOT, 'tools', 'docs-auditor', 'audit-docs.mjs');
      console.log(`[PresentationOS] Running full semantic docs and state audit...`);
      const res = spawnSync(process.execPath, [auditorScript, REPO_ROOT], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
      return res.status ?? 0;
    }

    case 'qa': {
      const input = args[0];
      if (!input) {
        console.error('Error: missing required argument <input.md>');
        return 1;
      }
      const absInput = resolve(process.cwd(), input);
      const absOut = args[1]
        ? resolve(process.cwd(), args[1])
        : absInput.replace(/\.md$/i, '.qa.json');
      const qaScript = join(REPO_ROOT, 'tools', 'visual-qa', 'qa-deck.mjs');
      console.log(`[PresentationOS] Auditing deck: ${absInput}`);
      console.log(`[PresentationOS] Report out:   ${absOut}`);
      const res = spawnSync(process.execPath, [qaScript, absInput, absOut], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
      return res.status ?? 0;
    }

    default: {
      console.error(`Unknown command: "${cmd}".`);
      printHelp();
      return 1;
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  process.exit(main(process.argv.slice(2)));
}
