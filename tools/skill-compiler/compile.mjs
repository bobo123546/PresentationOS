// Skill Compiler（PHASE 15）：skill.yaml → 自包含可执行 Skill 脚本
// 用法：node tools/skill-compiler/compile.mjs <skill-dir> [out-dir]
// 输出：<skill-name>.skill.mjs（可直接 node 执行）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, resolve, dirname, relative } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const skillDir = resolve(process.argv[2] ?? '.');
const outDir = resolve(process.argv[3] ?? skillDir);
const yaml = readFileSync(join(skillDir, 'skill.yaml'), 'utf8');

const nameMatch = /^\s*name:\s*([^\s#]+)/m.exec(yaml);
if (!nameMatch) { console.error('skill.yaml missing name'); process.exit(2); }
const name = nameMatch[1];

// 编译产物到仓库根的相对路径（POSIX 风格）
const relRoot = relative(outDir, REPO_ROOT).replace(/\\/g, '/');
// 每段 '..' 对应一层向上；repeat 次数 = 段数（过滤空段）
const up = relRoot === '.' ? '' : '../'.repeat(relRoot.split('/').filter(Boolean).length);

const compiled = `#!/usr/bin/env node
// Compiled by PresentationOS Skill Compiler v0.1.0
// source: ${basename(skillDir)}
// 用法：node ${name}.skill.mjs --markdownPath <md> [--output <pptx>] [--reference <pptx>] [--title <t>]
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '${up}');

const SKILL_YAML = ${JSON.stringify(yaml)};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) { out[key] = true; }
      else { out[key] = v; i++; }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { parseSkill, runSkill } = await import(pathToFileURL(join(REPO_ROOT, 'kernel/skill-runtime/dist/index.js')).href);
  const skill = parseSkill(SKILL_YAML, ${JSON.stringify(skillDir)});
  const input = {
    markdownPath: args.markdownPath,
    markdown: args.markdown,
    output: args.output,
    reference: args.reference,
    title: args.title,
  };
  const result = await runSkill(skill, input);
  if (!result.ok) {
    console.error('SKILL_FAILED:', result.error ?? 'unknown');
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, skill: result.skill, output: result.output, artifacts: result.artifacts }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
`;

const outPath = join(outDir, `${name}.skill.mjs`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, compiled, 'utf8');
console.log(JSON.stringify({ ok: true, skill: name, out: outPath }));
