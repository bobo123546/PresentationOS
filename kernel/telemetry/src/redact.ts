// Redaction Layer（总方案 PHASE 19）：写盘前必须脱敏
// 禁止记录：API Key / Token / Cookie / 密码 / Authorization / 敏感个人内容

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'api_key', re: /\b(api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{8,}['"]?/gi },
  { name: 'token', re: /\b(token|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{8,}['"]?/gi },
  { name: 'cookie', re: /\b(cookie|session[_-]?id)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.%]{8,}['"]?/gi },
  { name: 'password', re: /\b(password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{4,}['"]?/gi },
  { name: 'authorization', re: /\bauthorization\s*[:=]\s*['"]?Bearer\s+[A-Za-z0-9_\-\.]{8,}['"]?/gi },
  { name: 'bearer', re: /\bBearer\s+[A-Za-z0-9_\-\._]{12,}/g },
  { name: 'private_key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
];

const REDACTED = '[REDACTED]';

function redactValue(value: string): string {
  let out = value;
  for (const p of SECRET_PATTERNS) {
    out = out.replace(p.re, (match) => {
      // 保留字段名（如 password=），只替换值部分
      const eq = match.indexOf('=');
      if (eq > 0 && match.length > eq + 2) {
        const head = match.slice(0, eq + 1);
        const quote = /['"]$/.test(match.slice(eq + 1)) ? match.slice(-1) : '';
        return `${head}${REDACTED}${quote}`;
      }
      return REDACTED;
    });
  }
  return out;
}

export function redactString(value: string): string {
  return redactValue(value);
}

const SENSITIVE_KEYS = /^(api[_-]?key|token|access[_-]?token|refresh[_-]?token|cookie|session[_-]?id|password|passwd|pwd|authorization|secret|client[_-]?secret|private[_-]?key)$/i;

export function redactObject<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return redactValue(input) as unknown as T;
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (Array.isArray(input)) return input.map((i) => redactObject(i)) as unknown as T;
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactObject(v);
      }
    }
    return out as unknown as T;
  }
  return input;
}

/** 深度脱敏后的安全日志对象（禁止直接记录原始输入） */
export function sanitizeForLog<T>(input: T): unknown {
  return redactObject(input);
}
