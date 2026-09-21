// 汇总 106 项目 SBOM + Grype 漏洞 → upstream/audits/_audit_summary.json
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const auditsDir = 'D:/PresentationOS/upstream/audits';
const out = { generated_at: new Date().toISOString(), total: 0, with_sbom: 0, packages_total: 0, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, negligible: 0, unknown: 0 }, projects: [] };

function readJson(p) {
  let text = readFileSync(p, 'utf8');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM（PS 5.1 Out-File 写入）
  return JSON.parse(text);
}

const files = readdirSync(auditsDir);
const sbomFiles = files.filter((f) => f.endsWith('-sbom.json'));
out.total = sbomFiles.length;

for (const f of sbomFiles) {
  const name = f.replace(/-sbom\.json$/, '');
  const sbomPath = join(auditsDir, f);
  const grypePath = join(auditsDir, name + '-grype.json');
  const errPath = join(auditsDir, name + '-sbom.err');
  const gerrPath = join(auditsDir, name + '-grype.err');
  try {
    const sbom = readJson(sbomPath);
    const pkgs = (sbom.artifacts ?? []).length;
    out.packages_total += pkgs;
    let vulns = [];
    let grypeStatus = 'missing';
    if (existsSync(grypePath)) {
      try {
        const g = readJson(grypePath);
        vulns = g.matches ?? [];
        grypeStatus = 'ok';
      } catch { grypeStatus = 'parse-error'; }
    }
    const sev = {};
    for (const v of vulns) {
      const s = (v.vulnerability?.severity ?? 'unknown').toLowerCase();
      sev[s] = (sev[s] ?? 0) + 1;
    }
    out.vulnerabilities.critical += sev.critical ?? 0;
    out.vulnerabilities.high += sev.high ?? 0;
    out.vulnerabilities.medium += sev.medium ?? 0;
    out.vulnerabilities.low += sev.low ?? 0;
    out.vulnerabilities.negligible += sev.negligible ?? 0;
    out.vulnerabilities.unknown += sev.unknown ?? 0;
    const errText = existsSync(errPath) ? readFileSync(errPath, 'utf8').slice(0, 200) : '';
    out.projects.push({ name, packages: pkgs, vulnerabilities: vulns.length, by_severity: sev, grype_status: grypeStatus, sbom_error: errText.trim() ? errText.trim() : undefined });
  } catch (e) {
    out.projects.push({ name, error: String(e) });
  }
}
writeFileSync(join(auditsDir, '_audit_summary.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({ total: out.total, packages_total: out.packages_total, vulnerabilities: out.vulnerabilities, projects_with_error: out.projects.filter(p => p.error).length }, null, 2));
