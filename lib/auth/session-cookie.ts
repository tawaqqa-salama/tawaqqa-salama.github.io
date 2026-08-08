/**
 * Server/client helpers for httpOnly session cookie used by middleware + API gates.
 */

import type { AuthSession } from '@/lib/auth/types';

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
};

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

export function encodeCookiePayload(payload: CookieSessionPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCookiePayload(raw: string | undefined | null): CookieSessionPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as CookieSessionPayload;
    if (!parsed?.userId || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Browser-safe encode (no Buffer dependency issues in some runtimes) */
export function encodeCookiePayloadBrowser(payload: CookieSessionPayload): string {
  const json = JSON.stringify(payload);
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  return encodeCookiePayload(payload);
}
