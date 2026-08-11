import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

function encryptionKey(): Buffer | null {
  const raw =
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ||
    process.env.WHATSAPP_APP_SECRET ||
    '';
  if (!raw) return null;
  return createHash('sha256').update(raw).digest();
}

/** Encrypt secrets for DB storage. Never log the plaintext. */
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  if (!key) {
    // Fallback: mark as env-backed opaque (not reversible without key)
    return `envref:${createHash('sha256').update(plaintext).digest('hex').slice(0, 16)}`;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  if (payload.startsWith('envref:')) return null;
  if (!payload.startsWith('v1:')) return null;
  const key = encryptionKey();
  if (!key) return null;
  const [, ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

/** Meta Cloud API webhook signature (X-Hub-Signature-256). */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string | null | undefined
): boolean {
  if (!appSecret) {
    // Never allow unsigned webhooks in production — even if WHATSAPP_ALLOW_UNSIGNED is set.
    if (process.env.NODE_ENV === 'production') return false;
    return process.env.WHATSAPP_ALLOW_UNSIGNED === 'true';
  }
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.slice('sha256='.length).trim();
  if (expected.length !== provided.length) return false;
  // timing-safe compare
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return ok === 0;
}

export function redactSecrets<T extends Record<string, unknown>>(obj: T): T {
  const clone = { ...obj };
  for (const key of Object.keys(clone)) {
    if (/token|secret|password|authorization/i.test(key)) {
      (clone as Record<string, unknown>)[key] = '[redacted]';
    }
  }
  return clone;
}
