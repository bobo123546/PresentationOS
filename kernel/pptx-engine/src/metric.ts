/** Extract a literal highlight without reconstructing its sign, grouping or unit. */
export function metricLiteral(text: string): string | null {
  const match = /(?<![\d.,])(?:[+\-−]?\s*[$¥€£]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+\-]?\d+)?\s*(?:万元|亿元|美元|人民币|万|亿|千|台|家|位|个|次|人|%|％|ms|GB|TB|元))(?![\d.,])/u.exec(text);
  return match?.[0].trim() ?? null;
}
