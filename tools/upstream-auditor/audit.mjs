// upstream-auditor：扫描 H:\ppt 上游源池，生成 upstream/manifests/<project>.yaml
// 用法：node audit.mjs <srcDir> <outDir>
// 纯 Node 标准库实现（无第三方依赖），输出最小 YAML（机器可查）。
import { readdir, stat, readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const srcDir = process.argv[2] ?? 'H:\\ppt';
const outDir = process.argv[3] ?? 'D:\\PresentationOS\\upstream\\manifests';

const KEY_FILES = ['README.md', 'README.MD', 'README.txt', 'readme.md', 'LICENSE', 'LICENSE.md', 'LICENSE.txt',
  'SKILL.md', 'package.json', 'pyproject.toml', 'requirements.txt', 'requirements-dev.txt',
  'Cargo.toml', 'pom.xml', 'go.mod', 'Gemfile', 'Dockerfile', 'Makefile', 'AGENTS.md', 'CLAUDE.md', 'manifest.json', 'skill.yaml'];

function yamlStr(s) {
  if (s === null || s === undefined) return 'null';
  if (typeof s === 'number') return String(s);
  const str = String(s);
  if (/[:#\[\]{}&*!|>'"%@`]|^\s|\s$|^[0-9]|[\n\r]/.test(str)) {
    return JSON.stringify(str);
  }
  return str;
}

async function pathExists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function countFiles(dir, max = 200000) {
  let n = 0;
  let size = 0;
  async function walk(d) {
    if (n > max) return;
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (n > max) return;
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === '.git' || e.name === 'node_modules' || e.name === '.venv' || e.name === '__pycache__') continue;
        await walk(p);
      } else {
        n += 1;
        try { size += (await stat(p)).size; } catch { /* ignore */ }
      }
    }
  }
  await walk(dir);
  return { files: n, bytes: size };
}

async function gitRemote(dir) {
  const gitDir = join(dir, '.git');
  if (!(await pathExists(gitDir))) return { url: null, commit: null, branch: null };
  let url = null, commit = null, branch = null;
  const cfgPath = join(gitDir, 'config');
  try {
    const cfg = await readFile(cfgPath, 'utf8');
    const m = cfg.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(.+)/);
    if (m) url = m[1].trim();
  } catch { /* ignore */ }
  try {
    commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 15000 }).trim();
  } catch { /* ignore */ }
  try {
    branch = execFileSync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', timeout: 15000 }).trim();
  } catch { /* ignore */ }
  return { url, commit, branch };
}

function detectLanguages(entry, topEntries) {
  const langs = new Set();
  if (entry['package.json']) langs.add('typescript/javascript');
  if (entry['pyproject.toml'] || entry['requirements.txt'] || entry['requirements-dev.txt']) langs.add('python');
  if (entry['Cargo.toml']) langs.add('rust');
  if (entry['pom.xml']) langs.add('java');
  if (entry['go.mod']) langs.add('go');
  if (entry['Gemfile']) langs.add('ruby');
  if (topEntries.some((e) => e.endsWith('.csproj'))) langs.add('csharp');
  if (topEntries.some((e) => /\.(html?|css|js|ts|jsx|tsx)$/i.test(e))) langs.add('web');
  if (langs.size === 0) langs.add('unknown');
  return [...langs];
}

function detectRuntime(entry) {
  if (entry['package.json']) return 'node';
  if (entry['pyproject.toml'] || entry['requirements.txt']) return 'python';
  if (entry['Cargo.toml']) return 'rust';
  if (entry['pom.xml']) return 'java';
  if (entry['go.mod']) return 'go';
  if (entry['Gemfile']) return 'ruby';
  return 'unknown';
}

function findSkillFiles(entry, dir) {
  const found = [];
  if (entry['SKILL.md']) found.push('SKILL.md');
  // 一层子目录中的 SKILL.md
  return found;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const names = (await readdir(srcDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const summary = [];
  for (const name of names) {
    const dir = join(srcDir, name);
    const topEntries = (await readdir(dir, { withFileTypes: true })).map((e) => e.name);
    const entry = {};
    for (const f of KEY_FILES) entry[f] = topEntries.includes(f);
    const { files, bytes } = await countFiles(dir);
    const git = await gitRemote(dir);
    const langs = detectLanguages(entry, topEntries);
    const runtime = detectRuntime(entry);
    const license = entry['LICENSE'] || entry['LICENSE.md'] || entry['LICENSE.txt'] ? 'present' : 'missing';
    const hasTests = topEntries.some((e) => /^(test|tests|__tests__|spec)/i.test(e)) || topEntries.some((e) => /\.(test|spec)\./i.test(e));
    const skillFiles = findSkillFiles(entry, dir);
    const manifest = [
      'name: ' + yamlStr(name),
      'path: ' + yamlStr(dir),
      'repository: ' + yamlStr(git.url),
      'commit: ' + yamlStr(git.commit),
      'branch: ' + yamlStr(git.branch),
      'languages: [' + langs.map((l) => yamlStr(l)).join(', ') + ']',
      'runtime: ' + yamlStr(runtime),
      'license: ' + yamlStr(license),
      'entrypoints: []',
      'build: false',
      'tests: ' + (hasTests ? 'present' : 'missing'),
      'skill_files: [' + skillFiles.map((s) => yamlStr(s)).join(', ') + ']',
      'capabilities: []',
      'unique_capabilities: []',
      'duplicate_capabilities: []',
      'security: { sbom: false, grype: false, critical: null, high: null }',
      'integration_cost: 0',
      'classification: UNKNOWN',
      'decision_candidate: UNKNOWN',
      'deep_audit_required: true',
      'files: ' + files,
      'bytes: ' + bytes,
      'size_mb: ' + (bytes / 1048576).toFixed(1),
      'audited_at: ' + new Date().toISOString(),
    ].join('\n');
    const outPath = join(outDir, name.replace(/[^a-zA-Z0-9._-]/g, '_') + '.yaml');
    await writeFile(outPath, manifest, 'utf8');
    summary.push({ name, files, size_mb: +(bytes / 1048576).toFixed(1), runtime, license, commit: git.commit, repo: git.url });
    console.log(`[ok] ${name}  files=${files}  size=${(bytes / 1048576).toFixed(1)}MB  runtime=${runtime}`);
  }
  const regPath = join(outDir, '_registry.json');
  await writeFile(regPath, JSON.stringify({ total: summary.length, generated_at: new Date().toISOString(), projects: summary }, null, 2), 'utf8');
  console.log(`\n=== DONE: ${summary.length} manifests → ${outDir}`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
