import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSkill, loadSkill, validateInputs, runSkill } from '../src/index.js';

const GOOD_YAML = `
name: md-to-pptx
version: 0.1.0
description: Markdown to editable PPTX
capability: deck.render
inputs:
  - name: markdownPath
    type: string
    required: true
  - name: output
    type: string
    required: false
  - name: reference
    type: string
    required: false
`;

test('parseSkill accepts valid skill.yaml', () => {
  const s = parseSkill(GOOD_YAML, 'C:/skills/md-to-pptx');
  assert.equal(s.name, 'md-to-pptx');
  assert.equal(s.capability, 'deck.render');
  assert.equal(s.inputs.length, 3);
  assert.equal(s.inputs[0].required, true);
});

test('parseSkill rejects missing keys', () => {
  assert.throws(() => parseSkill('name: x\nversion: 1\n', 'C:/x'), /missing required key/);
});

test('parseSkill rejects bad name', () => {
  assert.throws(() => parseSkill(GOOD_YAML.replace('md-to-pptx', 'Bad Name'), 'C:/x'), /kebab-case/);
});

test('validateInputs flags missing required', () => {
  const s = parseSkill(GOOD_YAML, 'C:/x');
  const errs = validateInputs(s, {});
  assert.ok(errs.some((e) => e.includes('markdownPath')));
});

test('runSkill renders pptx from markdown path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-skill-'));
  const md = join(dir, 'in.md');
  const out = join(dir, 'out.pptx');
  writeFileSync(md, '# 测试标题\n\n## 第一页\n\n- 要点 A\n- 要点 B\n');
  const s = parseSkill(GOOD_YAML, dir);
  const r = await runSkill(s, { markdownPath: md, output: out });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.ok, true);
  assert.equal(r.output, out);
  assert.ok(r.artifacts.includes(out));
});

test('runSkill unsupported capability fails cleanly', async () => {
  const s = parseSkill(GOOD_YAML.replace('deck.render', 'unknown.cap'), 'C:/x');
  const r = await runSkill(s, { markdownPath: 'x.md' });
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /unsupported capability/);
});

test('loadSkill reads skill.yaml from dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pres-skill-'));
  writeFileSync(join(dir, 'skill.yaml'), GOOD_YAML);
  const s = loadSkill(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(s.name, 'md-to-pptx');
});
