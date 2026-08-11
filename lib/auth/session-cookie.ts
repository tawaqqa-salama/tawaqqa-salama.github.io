/**
 * Cryptographically signed httpOnly session cookie for middleware + API gates.
 * Payload is HMAC-SHA256 signed with AUTH_SESSION_SECRET — Base64 alone is NOT trust.
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { AuthSession } from '@/lib/auth/types';
import { isDemoAllowed, isStaticPagesBuild } from '@/lib/runtime/mode';

export const AUTH_COOKIE_NAME = 'tawaqqa_auth';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type CookieSessionPayload = {
  userId: string;
  email: string;
  fullName: string;
  roleCode: string;
  companyId?: string;
  loggedInAt: string;
  method: 'email' | 'phone';
  /** Issued-at (unix seconds) — set by encoder */
  iat?: number;
  /** Expiration (unix seconds) — set by encoder */
  exp?: number;
};

const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(raw: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(raw, 'base64url'));
  }
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function utf8ToBase64Url(text: string): string {
  return bytesToBase64Url(textEncoder.encode(text));
}

function base64UrlToUtf8(raw: string): string {
  const bytes = base64UrlToBytes(raw);
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Resolve signing secret. Production Node hosts require AUTH_SESSION_SECRET.
 * Demo / static Pages / local dev may use a deterministic non-production fallback
 * so GitHub Pages + local demos keep working without env secrets.
 */
export function getAuthSessionSecret(): string {
  const fromEnv = (process.env.AUTH_SESSION_SECRET || '').trim();
  if (fromEnv.length >= 16) return fromEnv;

  if (isStaticPagesBuild() || isDemoAllowed()) {
    return 'tawaqqa-demo-session-secret-not-for-production';
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'tawaqqa-dev-session-secret-change-me';
  }

  throw new Error(
    'AUTH_SESSION_SECRET is required in production (min 16 chars). Add it to server env — never NEXT_PUBLIC_*.'
  );
}

function signBody(bodyB64: string, secret: string): string {
  const mac = hmac(sha256, textEncoder.encode(secret), textEncoder.encode(bodyB64));
  return bytesToBase64Url(mac);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ok = 0;
  for (let i = 0; i < a.length; i++) {
    ok |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return ok === 0;
}

export function sessionToCookiePayload(
  session: AuthSession,
  companyId?: string
): CookieSessionPayload {
  return {
    userId: session.userId,
    email: session.email,
    fullName: session.fullName,
    roleCode: session.roleCode,
    companyId: companyId || session.companyId || undefined,
    loggedInAt: session.loggedInAt,
    method: session.method,
  };
}

/** Encode + HMAC-sign session payload. Format: `{body}.{sig}` (both base64url). */
export function encodeCookiePayload(payload: CookieSessionPayload): string {
  const now = Math.floor(Date.now() / 1000);
  const stamped: CookieSessionPayload = {
    ...payload,
    iat: typeof payload.iat === 'number' ? payload.iat : now,
    exp: typeof payload.exp === 'number' ? payload.exp : now + AUTH_COOKIE_MAX_AGE,
  };
  const bodyB64 = utf8ToBase64Url(JSON.stringify(stamped));
  const sig = signBody(bodyB64, getAuthSessionSecret());
  return `${bodyB64}.${sig}`;
}

/**
 * Verify signature + expiration. Rejects unsigned legacy Base64-only cookies
 * and any tampered payload (including forged roleCode / companyId).
 */
export function decodeCookiePayload(raw: string | undefined | null): CookieSessionPayload | null {
  if (!raw) return null;
  try {
    const trimmed = raw.trim();
    const dot = trimmed.lastIndexOf('.');
    if (dot <= 0 || dot === trimmed.length - 1) {
      // Legacy unsigned base64 payload — never trust
      return null;
    }

    const bodyB64 = trimmed.slice(0, dot);
    const sig = trimmed.slice(dot + 1);
    let secret: string;
    try {
      secret = getAuthSessionSecret();
    } catch {
      return null;
    }

    const expected = signBody(bodyB64, secret);
    if (!timingSafeEqual(sig, expected)) return null;

    const parsed = JSON.parse(base64UrlToUtf8(bodyB64)) as CookieSessionPayload;
    if (!parsed?.userId || !parsed?.email) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof parsed.exp === 'number' && parsed.exp < now) return null;
    if (typeof parsed.iat === 'number' && parsed.iat > now + 60) return null;

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Browser helper kept for API compatibility — prefer server-signed cookies.
 * Signing requires AUTH_SESSION_SECRET which must not be exposed to the browser;
 * this only builds the unsigned JSON body for diagnostics (server will re-sign).
 * @deprecated Prefer POST /api/auth/session which signs server-side.
 */
export function encodeCookiePayloadBrowser(payload: CookieSessionPayload): string {
  // Do not attempt HMAC in the browser (secret must stay server-only).
  // Return a clearly-invalid unsigned value so middleware rejects it if misused.
  const json = JSON.stringify(payload);
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  return utf8ToBase64Url(json);
}

/** Test helper: forge an unsigned legacy cookie (must be rejected). */
export function encodeUnsignedLegacyPayload(payload: CookieSessionPayload): string {
  return utf8ToBase64Url(JSON.stringify(payload));
}

/** Test helper: produce a cookie with an invalid signature. */
export function encodeTamperedCookiePayload(payload: CookieSessionPayload): string {
  const bodyB64 = utf8ToBase64Url(JSON.stringify(payload));
  return `${bodyB64}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
}
