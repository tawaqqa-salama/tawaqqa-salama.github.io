import { timingSafeEqual } from 'node:crypto';

export function getRequiredApiKey(): string {
  const key = String(process.env.OCR_API_KEY || '').trim();
  if (!key) {
    throw new Error('OCR_API_KEY is required');
  }
  return key;
}

/** Constant-time Bearer comparison when lengths match. */
export function authorizeBearer(
  authorizationHeader: string | undefined,
  expectedKey: string
): boolean {
  if (!authorizationHeader || !expectedKey) return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;
  const provided = match[1].trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(expectedKey);
  if (a.length !== b.length) {
    // Still do a dummy compare to reduce timing leakage on length
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}
