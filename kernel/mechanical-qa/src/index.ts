// Mechanical QA（总方案 PHASE 9）：对 DeckSpec 与几何矩形做确定性检查
// 检查项：负尺寸 / 溢出页面 / 元素重叠 / 非法 XML 字符 / 空文本 / 图表数据一致性

export interface QARect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface QAFinding {
  check: string;
  severity: 'error' | 'warning';
  message: string;
  itemId?: string;
}

export interface QAResult {
  ok: boolean;
  findings: QAFinding[];
  checks: Record<string, number>;
}

export interface MechanicalQaInput {
  pageWidth: number;
  pageHeight: number;
  rects: QARect[];
  blocks?: Array<{ id?: string; type: string; text?: string; chartType?: string; data?: { labels?: string[]; series?: Array<{ name?: string; values?: number[] }> } }>;
}

export function runMechanicalQa(input: MechanicalQaInput): QAResult {
  const findings: QAFinding[] = [];
  const checks: Record<string, number> = {};
  const count = (k: string) => { checks[k] = (checks[k] ?? 0) + 1; };

  for (const r of input.rects) {
    // 1) 负尺寸（BUG-0002 回归）
    if (r.w <= 0 || r.h <= 0) {
      findings.push({ check: 'non-positive-size', severity: 'error', message: `rect ${r.id} has non-positive size w=${r.w} h=${r.h}`, itemId: r.id });
      count('non-positive-size');
    }
    // 2) 溢出页面
    if (r.x < -0.001 || r.y < -0.001 || r.x + r.w > input.pageWidth + 0.001 || r.y + r.h > input.pageHeight + 0.001) {
      findings.push({ check: 'overflow', severity: 'warning', message: `rect ${r.id} overflows page (x=${r.x.toFixed(2)}, y=${r.y.toFixed(2)}, w=${r.w.toFixed(2)}, h=${r.h.toFixed(2)})`, itemId: r.id });
      count('overflow');
    }
  }

  // 3) 元素重叠（仅对非空尺寸、不同 id 检查）
  for (let i = 0; i < input.rects.length; i++) {
    for (let j = i + 1; j < input.rects.length; j++) {
      const a = input.rects[i];
      const b = input.rects[j];
      if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) continue;
      if (overlap(a, b)) {
        findings.push({ check: 'overlap', severity: 'warning', message: `rects ${a.id} and ${b.id} overlap`, itemId: a.id });
        count('overlap');
      }
    }
  }

  // 4) 非法 XML 字符 / 空文本
  for (const b of input.blocks ?? []) {
    const id = b.id ?? b.type;
    if (b.type === 'text') {
      if (b.text === undefined || b.text.trim() === '') {
        findings.push({ check: 'empty-text', severity: 'error', message: `block ${id} has empty text`, itemId: id });
        count('empty-text');
      } else if (/[<>&]/.test(b.text) && !/&(lt|gt|amp);/.test(b.text)) {
        findings.push({ check: 'unescaped-xml', severity: 'error', message: `block ${id} text contains unescaped < > &`, itemId: id });
        count('unescaped-xml');
      }
    }
    // 5) 图表数据一致性
    if (b.type === 'chart') {
      const labels = b.data?.labels ?? [];
      const series = b.data?.series ?? [];
      if (labels.length === 0 || series.length === 0) {
        findings.push({ check: 'chart-empty-data', severity: 'error', message: `block ${id} chart has empty labels/series`, itemId: id });
        count('chart-empty-data');
      }
      for (const s of series) {
        if ((s.values?.length ?? 0) !== labels.length) {
          findings.push({ check: 'chart-length-mismatch', severity: 'error', message: `block ${id} series '${s.name}' length ${s.values?.length} != labels ${labels.length}`, itemId: id });
          count('chart-length-mismatch');
        }
      }
    }
  }

  const errors = findings.filter((f) => f.severity === 'error');
  return { ok: errors.length === 0, findings, checks };
}

function overlap(a: QARect, b: QARect): boolean {
  const eps = 0.02; // 2 千英寸容差
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps;
}
