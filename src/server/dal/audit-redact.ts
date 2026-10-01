/** Pure helpers for audit payloads: redaction of secret-bearing keys and change-only diffs. */
const SENSITIVE_KEY = /(enc|password|secret|token)$/i;
const IGNORED_KEYS = new Set(["updatedAt"]);

export function redactSensitive<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redactSensitive(v);
  }
  return out as T;
}

function canonical(v: unknown): string {
  return JSON.stringify(v, (_key, val: unknown) => {
    if (val instanceof Date) return val.toISOString();
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      const o = val as Record<string, unknown>;
      // Decimal-like objects (Prisma Decimal) stringify to their value.
      if (typeof (o as { toFixed?: unknown }).toFixed === "function") return String(val);
      return Object.fromEntries(
        Object.keys(o)
          .sort()
          .map((k) => [k, o[k]]),
      );
    }
    return val;
  });
}

/** Only the keys whose values differ (JSON equality), on both sides, excluding updatedAt. */
export function diffForAudit(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of keys) {
    if (IGNORED_KEYS.has(k)) continue;
    if (canonical(before[k]) === canonical(after[k])) continue;
    if (k in before) b[k] = before[k];
    if (k in after) a[k] = after[k];
  }
  return { before: b, after: a };
}
