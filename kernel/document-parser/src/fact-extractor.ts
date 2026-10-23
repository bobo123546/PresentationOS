// Literal quantity extraction; this verifies occurrence preservation, not factual truth.
import { ExtractedFact, FactPreservationReport } from './types.js';

const NUMBER = String.raw`(?:\d{1,3}(?:[,，]\d{3})+|\d+)(?:\.\d+)?(?:[eE][+\-]?\d+)?`;
const SIGN = String.raw`[+\-−＋－负]?`;
const QUANTITY = `${SIGN}${NUMBER}`;
const SCALE = '(?:万亿|千亿|百亿|十亿|千万|百万|十万|亿|万|千|百)';
const CURRENCY = '(?:人民币|美元|港元|港币|欧元|英镑|日元|元)';
const UNIT = '(?:毫秒|分钟|小时|千米|公里|千克|公斤|平方米|平方公里|立方米|万元|亿元|位|个|项|套|条|台|款|次|天|年|月|日|秒|分|人|家|件|张|页|米|吨|度|倍|岁|期|批|万|亿|千|百|(?:KiB|MiB|GiB|TiB|KB|MB|GB|TB|ms|km|kg|cm|mm|MHz|GHz|Hz|QPS|fps|mL|ml|m|s|g|L)(?![A-Za-z]))';

export const FACT_PATTERNS = [
  { type: 'date' as const, regex: /\d{4}(?:-\d{1,2}-\d{1,2}|\/\d{1,2}\/\d{1,2}|年\d{1,2}月\d{1,2}日?)/g },
  { type: 'currency' as const, regex: new RegExp(`${SIGN}[$¥￥€£]\\s*${SIGN}${NUMBER}(?:[KMGTBkmgtb](?:n|N)?)?|${QUANTITY}\\s*(?:${SCALE})?${CURRENCY}`, 'g') },
  { type: 'percentage' as const, regex: new RegExp(`${QUANTITY}\\s*[%％]`, 'g') },
  { type: 'unit' as const, regex: new RegExp(`${QUANTITY}\\s*(?:${SCALE}\\s*)?${UNIT}`, 'g') },
  { type: 'numeric' as const, regex: new RegExp(QUANTITY, 'g') },
];

export function extractFacts(text: string, chunkId = 'chk-0', startIndex = 0): ExtractedFact[] {
  const candidates: Array<{ start: number; end: number; type: ExtractedFact['factType']; value: string; priority: number }> = [];
  for (const [priority, { type, regex }] of FACT_PATTERNS.entries()) {
    // A fresh instance avoids mutable lastIndex leaking between callers.
    for (const match of text.matchAll(new RegExp(regex.source, regex.flags))) {
      const start = match.index!, end = start + match[0].length;
      const before = text[start - 1] ?? '', after = text[end] ?? '';
      if (/[A-Za-z0-9_]/.test(before) || /[0-9_]/.test(after)) continue;
      if (type === 'numeric' && /[A-Za-z]/.test(after)) continue;
      if (type === 'currency' && /[A-Za-z]/.test(after)) continue;
      candidates.push({ start, end, type, value: match[0], priority });
    }
  }
  // One complete fact for each span: a date/currency includes its numeric parts.
  candidates.sort((a, b) => a.start - b.start || b.end - a.end || a.priority - b.priority);
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (candidate.start < (selected.at(-1)?.end ?? 0)) continue;
    selected.push(candidate);
  }
  return selected.map((fact, i) => ({ factId: `fact_${String(startIndex + i).padStart(4, '0')}`, chunkId, factType: fact.type, literalValue: fact.value, charRange: [fact.start, fact.end], verified: true }));
}

export function verifyFactsPreserved(facts: ExtractedFact[], targetText: string): FactPreservationReport {
  const normalize = (value: string): string => value.trim().replace(/\s+/g, ' ');
  const remaining = new Map<string, number>();
  for (const fact of extractFacts(targetText)) {
    const key = normalize(fact.literalValue); remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const missingFacts: string[] = [];
  for (const fact of facts) {
    const key = normalize(fact.literalValue), count = remaining.get(key) ?? 0;
    if (count > 0) remaining.set(key, count - 1);
    else missingFacts.push(fact.literalValue);
  }
  const preservedFacts = facts.length - missingFacts.length;
  return { preserved: missingFacts.length === 0, totalFacts: facts.length, preservedFacts, missingFacts, coverageRatio: facts.length ? Number((preservedFacts / facts.length).toFixed(4)) : 1 };
}
