#!/usr/bin/env node
// Compiled by PresentationOS Skill Compiler v0.1.0
// source: md-to-pptx
// 用法：node md-to-pptx.skill.mjs --markdownPath <md> [--output <pptx>] [--reference <pptx>] [--title <t>]
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');

const SKILL_YAML = "name: md-to-pptx\nversion: 0.1.0\ndescription: 从 Markdown 生成可编辑 PPTX（可选参考模板，自动提取视觉 DNA）\ncapability: deck.render\ninputs:\n  - name: markdownPath\n    type: string\n    required: true\n    description: Markdown 输入文件路径\n  - name: output\n    type: string\n    required: false\n    description: 输出 PPTX 路径（默认当前目录）\n  - name: reference\n    type: string\n    required: false\n    description: 参考 PPTX 模板路径（提取配色/字体）\n  - name: title\n    type: string\n    required: false\n    description: Deck 标题（默认取 Markdown 一级标题）\n";

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
  const skill = parseSkill(SKILL_YAML, "D:\\PresentationOS\\skills\\md-to-pptx");
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
