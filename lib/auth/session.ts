import type { AuthSession } from '@/lib/auth/types';
import { sessionToCookiePayload } from '@/lib/auth/session-cookie';
import { areApiRoutesAvailable } from '@/lib/runtime/mode';

const STORAGE_KEY = 'tawaqqa_auth_session_v1';
const COOKIE_SYNC_TIMEOUT_MS = 2500;

function abortAfter(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

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
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode / quota — in-memory AuthProvider session still works for this tab
  }
  void syncSessionCookie(session, companyId);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  if (!areApiRoutesAvailable()) return;
  void fetch('/api/auth/session', {
    method: 'DELETE',
    signal: abortAfter(COOKIE_SYNC_TIMEOUT_MS),
  }).catch(() => undefined);
}

/**
 * Best-effort cookie sync for Node/Vercel hosts.
 * Skipped on GitHub Pages (no /api routes) so auth hydrate never hangs.
 * Sends Supabase access token when available so the server can mint a trusted cookie
 * (role/company are loaded server-side — never trusted from this payload alone).
 */
export async function syncSessionCookie(
  session: AuthSession,
  companyId?: string
): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!areApiRoutesAvailable()) return;
  try {
    let accessToken: string | undefined;
    try {
      const { supabase, isDemoMode } = await import('@/lib/supabase');
      if (!isDemoMode) {
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token || undefined;
      }
    } catch {
      // Demo / unavailable Auth — server may still mint in demo-allowed mode
    }

    const payload = {
      ...sessionToCookiePayload(session, companyId),
      ...(accessToken ? { accessToken } : {}),
    };

    await fetch('/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      signal: abortAfter(COOKIE_SYNC_TIMEOUT_MS),
    });
  } catch {
    // Static Pages / offline / timeout — localStorage session still works for UI
  }
}
