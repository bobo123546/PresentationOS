// 漏洞按项目分布报告 → upstream/audits/_vuln_by_project.json + 摘要
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const summary = JSON.parse(readFileSync('D:/PresentationOS/upstream/audits/_audit_summary.json', 'utf8'));
const byProj = summary.projects
  .map((p) => ({ name: p.name, packages: p.packages ?? 0, vulns: p.vulnerabilities ?? 0, critical: p.by_severity?.critical ?? 0, high: p.by_severity?.high ?? 0, medium: p.by_severity?.medium ?? 0, low: p.by_severity?.low ?? 0 }))
  .sort((a, b) => (b.critical + b.high) - (a.critical + a.high));

writeFileSync('D:/PresentationOS/upstream/audits/_vuln_by_project.json', JSON.stringify(byProj, null, 2), 'utf8');

console.log('=== TOP 15 by critical+high ===');
for (const p of byProj.slice(0, 15)) {
  console.log(`${p.name.padEnd(32)} pkgs=${String(p.packages).padStart(5)} crit=${p.critical} high=${p.high} med=${p.medium} low=${p.low}`);
}
console.log('=== projects with 0 vulns ===', byProj.filter((p) => p.vulns === 0).length);
