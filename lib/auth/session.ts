import type { AuthSession } from '@/lib/auth/types';
import { sessionToCookiePayload } from '@/lib/auth/session-cookie';

const STORAGE_KEY = 'tawaqqa_auth_session_v1';

export function loadSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.userId || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist local session + sync httpOnly cookie for middleware/API (best-effort). */
export function saveSession(session: AuthSession, companyId?: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  void syncSessionCookie(session, companyId);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  void fetch('/api/auth/session', { method: 'DELETE' }).catch(() => undefined);
}

export async function syncSessionCookie(
  session: AuthSession,
  companyId?: string
): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionToCookiePayload(session, companyId)),
      credentials: 'same-origin',
    });
  } catch {
    // Static Pages host may 404 — localStorage session still works for UI
  }
}
