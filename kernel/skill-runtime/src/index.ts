// Skill DSL v1（PHASE 15）：YAML 描述 → 加载校验 → 通过能力执行
// 支持内建能力：deck.render（Markdown → PPTX，可带参考模板 DNA）
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SkillInput {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface SkillDef {
  name: string;
  version: string;
  description: string;
  capability: string;
  inputs: SkillInput[];
  /** skill.yaml 所在目录（含 SKILL.md 与脚本） */
  dir: string;
}

export interface SkillRunInput {
  markdown?: string;
  markdownPath?: string;
  output?: string;
  reference?: string;
  title?: string;
}

export interface SkillRunResult {
  ok: boolean;
  skill: string;
  capability: string;
  output?: string;
  artifacts: string[];
  error?: string;
}

const REQUIRED_KEYS = ['name', 'version', 'description', 'capability', 'inputs'] as const;

/** 解析并校验 skill.yaml 文本 */
export function parseSkill(yamlText: string, dir: string): SkillDef {
  const raw = parseYaml(yamlText) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') throw new Error('skill.yaml must be a mapping');
  for (const k of REQUIRED_KEYS) {
    if (!(k in raw)) throw new Error(`skill.yaml missing required key: ${k}`);
  }
  if (typeof raw.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(raw.name)) {
    throw new Error('skill.name must be lowercase kebab-case');
  }
  if (typeof raw.version !== 'string') throw new Error('skill.version must be a string');
  if (typeof raw.capability !== 'string') throw new Error('skill.capability must be a string');
  if (!Array.isArray(raw.inputs)) throw new Error('skill.inputs must be an array');
  const inputs: SkillInput[] = raw.inputs.map((i) => {
    const o = i as Record<string, unknown>;
    if (typeof o.name !== 'string' || typeof o.type !== 'string') throw new Error('each input needs name and type');
    return { name: o.name, type: o.type, required: o.required === true, description: typeof o.description === 'string' ? o.description : undefined };
  });
  return { name: raw.name, version: raw.version, description: raw.description as string, capability: raw.capability, inputs, dir };
}

/** 从目录加载 skill.yaml */
export function loadSkill(dir: string): SkillDef {
  const yamlPath = join(dir, 'skill.yaml');
  return parseSkill(readFileSync(yamlPath, 'utf8'), dir);
}

/** 校验输入（required / type） */
export function validateInputs(skill: SkillDef, input: SkillRunInput): string[] {
  const errs: string[] = [];
  for (const def of skill.inputs) {
    const v = (input as Record<string, unknown>)[def.name];
    if (def.required && (v === undefined || v === null || v === '')) errs.push(`missing required input: ${def.name}`);
    if (v !== undefined && def.type === 'number' && typeof v !== 'number') errs.push(`input ${def.name} must be number`);
    if (v !== undefined && def.type === 'boolean' && typeof v !== 'boolean') errs.push(`input ${def.name} must be boolean`);
  }
  return errs;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 执行 Skill：当前支持 capability deck.render（内建：md→pptx，可带 reference 模板） */
export async function runSkill(skill: SkillDef, input: SkillRunInput): Promise<SkillRunResult> {
  const errs = validateInputs(skill, input);
  if (errs.length > 0) return { ok: false, skill: skill.name, capability: skill.capability, artifacts: [], error: errs.join('; ') };

  switch (skill.capability) {
    case 'deck.render': {
      // markdownPath 或 markdown 内容；输出路径默认取标题
      const md = input.markdown ?? (input.markdownPath ? readFileSync(input.markdownPath, 'utf8') : '');
      if (!md.trim()) return { ok: false, skill: skill.name, capability: skill.capability, artifacts: [], error: 'no markdown content' };
      const out = input.output ?? join(process.cwd(), `${skill.name}-${Date.now()}.pptx`);
      const { renderMarkdownDeck } = await import('./deck-render.js');
      const r = await renderMarkdownDeck(md, out, input.reference, input.title);
      if (!r.ok) return { ok: false, skill: skill.name, capability: skill.capability, artifacts: [], error: r.error };
      return { ok: true, skill: skill.name, capability: skill.capability, output: out, artifacts: [out, ...r.qaArtifacts] };
    }
    default:
      return { ok: false, skill: skill.name, capability: skill.capability, artifacts: [], error: `unsupported capability: ${skill.capability}` };
  }
}
