// Script normalizer: converts raw slide notes into pronunciation-optimized narration scripts.

const DIGIT_MAP: Record<string, string> = {
  '0': '零',
  '1': '一',
  '2': '二',
  '3': '三',
  '4': '四',
  '5': '五',
  '6': '六',
  '7': '七',
  '8': '八',
  '9': '九',
};

/** Convert small integers (<10000) to Chinese words */
function numberToChinese(num: number): string {
  if (num === 0) return '零';
  if (num < 10) return DIGIT_MAP[String(num)];
  if (num < 20) {
    return num === 10 ? '十' : `十${DIGIT_MAP[String(num % 10)]}`;
  }
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${DIGIT_MAP[String(tens)]}十${ones > 0 ? DIGIT_MAP[String(ones)] : ''}`;
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const rem = num % 100;
    if (rem === 0) return `${DIGIT_MAP[String(hundreds)]}百`;
    if (rem < 10) return `${DIGIT_MAP[String(hundreds)]}百零${DIGIT_MAP[String(rem)]}`;
    return `${DIGIT_MAP[String(hundreds)]}百${numberToChinese(rem)}`;
  }
  if (num < 10000) {
    const thousands = Math.floor(num / 1000);
    const rem = num % 1000;
    if (rem === 0) return `${DIGIT_MAP[String(thousands)]}千`;
    if (rem < 100) return `${DIGIT_MAP[String(thousands)]}千零${numberToChinese(rem)}`;
    return `${DIGIT_MAP[String(thousands)]}千${numberToChinese(rem)}`;
  }
  return String(num).split('').map((d) => DIGIT_MAP[d] ?? d).join('');
}

/** Convert year like 2026年 to 二零二六年 */
function normalizeYears(text: string): string {
  return text.replace(/(?<![\d.,])(\d{4})年/g, (_, yearStr) => {
    const chars = yearStr.split('').map((d: string) => DIGIT_MAP[d] ?? d).join('');
    return `${chars}年`;
  });
}

/** Convert percentages like 24% to 百分之二十四 */
function normalizePercentages(text: string): string {
  return text.replace(/(?<![\d.,])(\d+(?:\.\d+)?)%/g, (_, numStr) => {
    const num = parseFloat(numStr);
    if (!isNaN(num) && num < 1000 && !numStr.includes('.')) {
      return `百分之${numberToChinese(num)}`;
    }
    return `百分之${numStr}`;
  });
}

/** Convert numbers with Chinese units like 50万元 -> 五十万元, 120台 -> 一百二十台 */
function normalizeQuantities(text: string): string {
  return text.replace(/(?<![\d.,\-−])(\d+)(万|亿|千|百|个|位|台|份|件|套|项|条|家|点|次)/g, (_, numStr, unit) => {
    const num = parseInt(numStr, 10);
    if (!isNaN(num) && num < 10000) {
      return `${numberToChinese(num)}${unit}`;
    }
    return `${numStr}${unit}`;
  });
}

/**
 * Normalizes raw speaker notes into a speech-ready narration script.
 */
export function normalizeNarrationScript(rawNotes: string): {
  narrationScript: string;
  isSilent: boolean;
} {
  if (!rawNotes || !rawNotes.trim()) {
    return {
      narrationScript: '',
      isSilent: true,
    };
  }

  let script = rawNotes.trim();

  // Remove only unambiguous Markdown wrappers, retaining identifiers (a_b), C# and mathematical symbols.
  script = script.replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/`([^`\n]+)`/g, '$1').replace(/\*\*([^*\n]+)\*\*/g, '$1');

  // A unary negative sign needs an explicit spoken word. Preserve subtraction/ranges (5-10).
  script = script.replace(/(^|[^\dA-Za-z_.])[-−](?=\d)/g, '$1负');
  // Remove grouping commas only from complete, well-formed numeric tokens.
  script = script.replace(/(?<![\dA-Za-z_.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])/g, token => token.replace(/,/g, ''));

  // Normalize years, percentages, and quantities with Chinese units
  script = normalizeYears(script);
  script = normalizePercentages(script);
  script = normalizeQuantities(script);

  // Add pauses at semicolons and colons
  script = script.replace(/[;；]/g, '，');

  return {
    narrationScript: script,
    isSilent: false,
  };
}
