/**
 * Lightweight input validation helpers (no new dependency).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function asTrimmedString(value: unknown, max = 500): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

export function isEmail(value: unknown): boolean {
  const s = asTrimmedString(value, 254);
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Strip HTML/script-ish content from free-text public form fields. */
export function sanitizePlainText(value: unknown, max = 2000): string {
  return asTrimmedString(value, max)
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
}

export function clampNumber(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label = 'value'
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Invalid ${label}`);
}

/** Very small in-memory rate limiter (per process). Suitable for single Node instance. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (cur.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
  }
  cur.count += 1;
  return { ok: true };
}

/** Test helper — clear rate limit buckets between cases. */
export function resetRateLimitBuckets() {
  buckets.clear();
}
