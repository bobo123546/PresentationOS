// PresentationOS Fact Extraction & 100% Provenance Preservation Engine (P05)
import { ExtractedFact, FactPreservationReport } from './types.js';

export const FACT_PATTERNS = [
  // Currencies: $100, ¥500, 50万元, 100亿美元
  { type: 'currency' as const, regex: /[$¥€£]\s*\d+(?:\.\d+)?(?:[KMGTBkmgtb]B?)?|\d+(?:\.\d+)?\s*(?:元|美元|人民币|万元|亿元)/g },
  // Percentages: 99.9%, 15％
  { type: 'percentage' as const, regex: /\d+(?:\.\d+)?\s*[%％]/g },
  // Quantities with units: 50项, 120台, 100位, 500ms, 16GB
  { type: 'unit' as const, regex: /(?:\d+(?:\.\d+)?\s*(?:万|亿|千|百|位|个|项|套|条|台|款|次|天|年|月|日|秒|分|人)|\d+(?:\.\d+)?\s*(?:ms|km|kg|KB|MB|GB|TB)\b)/g },
  // Dates: 2026-10-23, 2026年10月23日
  { type: 'date' as const, regex: /\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?\b/g },
  // Formatted numeric numbers: 1,000,000.50
  { type: 'numeric' as const, regex: /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g },
];

export function extractFacts(
  text: string,
  chunkId: string = 'chk-0',
  startIndex: number = 0
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  let factIndex = startIndex;
  const seenLiterals = new Set<string>();

  for (const { type, regex } of FACT_PATTERNS) {
    // Reset regex state
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const val = match[0].trim();
      if (!val || seenLiterals.has(`${val}@${match.index}`)) continue;
      seenLiterals.add(`${val}@${match.index}`);

      facts.push({
        factId: `fact_${String(factIndex).padStart(4, '0')}`,
        chunkId,
        factType: type,
        literalValue: val,
        charRange: [match.index, match.index + val.length],
        verified: true,
      });
      factIndex++;
    }
  }

  // Sort by appearance in text
  return facts.sort((a, b) => (a.charRange?.[0] ?? 0) - (b.charRange?.[0] ?? 0));
}

export function verifyFactsPreserved(
  facts: ExtractedFact[],
  targetText: string
): FactPreservationReport {
  if (facts.length === 0) {
    return {
      preserved: true,
      totalFacts: 0,
      preservedFacts: 0,
      missingFacts: [],
      coverageRatio: 1.0,
    };
  }

  const missingFacts: string[] = [];
  // Normalize whitespaces for resilient matching
  const normalizedTarget = targetText.replace(/\s+/g, ' ');

  for (const fact of facts) {
    const rawVal = fact.literalValue.trim();
    const normalizedVal = rawVal.replace(/\s+/g, ' ');

    if (!normalizedTarget.includes(normalizedVal) && !targetText.includes(rawVal)) {
      missingFacts.push(rawVal);
    }
  }

  const preservedFacts = facts.length - missingFacts.length;
  const coverageRatio = Number((preservedFacts / facts.length).toFixed(4));

  return {
    preserved: missingFacts.length === 0,
    totalFacts: facts.length,
    preservedFacts,
    missingFacts,
    coverageRatio,
  };
}
