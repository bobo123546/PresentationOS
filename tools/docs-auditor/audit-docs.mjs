// docs-auditor（总方案第 22 节）：检查五文档与代码/状态的匹配
// 用法: node tools/docs-auditor/audit-docs.mjs [repoRoot]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(process.argv[2] ?? '.');

const DOCS = {
  '交接文档.md': { mustHave: ['【AI恢复执行】', '当前唯一任务', '阶段日志', '变更记录'] },
  '源码结构文档.md': { mustHave: ['kernel/', 'tools/', 'workers/'] },
  '编译部署指南.md': { mustHave: ['pnpm', 'node', 'dotnet'] },
  '训练数据.md': { mustHave: ['case_id', 'golden'] },
  '协作提示词.md': { mustHave: ['Collaboration Spec Version', 'Definition of Done', 'Evidence'] },
};

function check(checks, name, pass, detail) {
  checks.push({ name, pass, detail });
  return pass;
}

const checks = [];

// 1) 五文档存在 + 关键段落
let allExist = true;
for (const [file, reqs] of Object.entries(DOCS)) {
  const p = join(REPO, 'docs', file);
  if (!existsSync(p)) { check(checks, `docs/${file}`, false, '文件不存在'); allExist = false; continue; }
  const text = readFileSync(p, 'utf8');
  const compact = text.replace(/\s+/g, '');
  const missing = reqs.mustHave.filter((k) => !compact.includes(k.replace(/\s+/g, '')));
  check(checks, `docs/${file}`, missing.length === 0, missing.length ? `缺关键段落: ${missing.join(', ')}` : `存在，${reqs.mustHave.length} 段齐全`);
}
check(checks, '五文档齐全', allExist, allExist ? 'PASS' : 'FAIL');

// 2) kernel 包与源码结构文档匹配
const kernelDir = join(REPO, 'kernel');
const srcDocPath = join(REPO, 'docs', '源码结构文档.md');
const srcDoc = existsSync(srcDocPath) ? readFileSync(srcDocPath, 'utf8') : '';
const kernels = existsSync(kernelDir)
  ? readdirSync(kernelDir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(kernelDir, d.name, 'package.json'))).map((d) => d.name)
  : [];
const missingKernels = kernels.filter((k) => !srcDoc.includes(k));
check(checks, 'kernel 包与源码结构文档同步', missingKernels.length === 0, missingKernels.length ? `文档缺: ${missingKernels.join(', ')}` : `${kernels.length} 个 kernel 包全部覆盖`);

// 3) 编译部署指南包含当前测试命令
const buildDoc = existsSync(join(REPO, 'docs', '编译部署指南.md')) ? readFileSync(join(REPO, 'docs', '编译部署指南.md'), 'utf8') : '';
const scriptDirs = ['pptx-engine', 'mechanical-qa', 'template-dna', 'pptx-editor', 'skill-runtime', 'plugin-sdk', 'model-router', 'visual-qa', 'revision-engine'];
const cmdMissing = scriptDirs.filter((d) => !buildDoc.includes(d));
check(checks, '编译部署指南覆盖各包命令', cmdMissing.length === 0, cmdMissing.length ? `缺: ${cmdMissing.join(', ')}` : `${scriptDirs.length} 个包命令已记录`);

// 4) 训练数据 Golden Case 递增
const trainDoc = existsSync(join(REPO, 'docs', '训练数据.md')) ? readFileSync(join(REPO, 'docs', '训练数据.md'), 'utf8') : '';
const gIds = [...trainDoc.matchAll(/\|?\s*(G-\d{3})/g)].map((m) => m[1]);
const nums = gIds.map((g) => parseInt(g.slice(2), 10)).sort((a, b) => a - b);
const continuous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
check(checks, '训练数据 Golden Case 连续递增', continuous && nums.length >= 1, `共 ${nums.length} 个 G-${String(nums[nums.length - 1] ?? 0).padStart(3, '0')}（连续=${continuous}）`);

// 5) 协作提示词版本
const collab = existsSync(join(REPO, 'docs', '协作提示词.md')) ? readFileSync(join(REPO, 'docs', '协作提示词.md'), 'utf8') : '';
const verMatch = /Collaboration Spec Version[:：]\s*([\w.]+)/.exec(collab);
check(checks, '协作提示词版本号', !!verMatch, verMatch ? `版本 ${verMatch[1]}` : '未找到版本号');

// 6) state 文件存在且可解析
const stateP = join(REPO, 'state', 'project_state.json');
let stateOk = false;
let stateDetail = '';
if (existsSync(stateP)) {
  try {
    const st = JSON.parse(readFileSync(stateP, 'utf8'));
    stateOk = !!st.current_phase && !!st.project_version;
    stateDetail = `${st.project_version} / ${st.current_phase}`;
  } catch { stateDetail = 'JSON 解析失败'; }
}
check(checks, 'state/project_state.json 有效', stateOk, stateDetail || '缺失');

const passAll = checks.every((c) => c.pass);
console.log(JSON.stringify({ repo: REPO, passAll, checks, updatedAt: new Date().toISOString() }, null, 2));
process.exit(passAll ? 0 : 1);
