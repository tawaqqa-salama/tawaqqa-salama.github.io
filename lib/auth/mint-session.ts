/**
 * Server-side session minting: never trust browser roleCode / companyId.
 * Production: verify Supabase JWT, load users by auth_user_id only (JWT/service-role client).
 */

import {
  encodeCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';
import {
  isUserRowUsable,
  loadUserByAuthUserIdTrusted,
  loadUserByEmailTrusted,
  loadUserByIdTrusted,
  type TrustedUserRow,
} from '@/lib/auth/trusted-user';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isDemoAllowed } from '@/lib/runtime/mode';

export type SessionMintRequest = {
  userId?: string;
  email?: string;
  fullName?: string;
  roleCode?: string;
  companyId?: string;
  loggedInAt?: string;
  method?: 'email' | 'phone';
  /** Supabase Auth access token — required proof of identity when Supabase is configured */
  accessToken?: string;
};

export type SessionMintResult =
  | { ok: true; payload: CookieSessionPayload; cookieValue: string }
  | { ok: false; error: string; status: number };

function toPayload(
  user: TrustedUserRow,
  method: 'email' | 'phone',
  loggedInAt?: string
): CookieSessionPayload {
  const roleCode = user.role_code;

  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name || user.email,
    roleCode,
    companyId: user.company_id || undefined,
    loggedInAt: loggedInAt || new Date().toISOString(),
    method,
  };
}

/**
 * Establish a trusted session cookie payload.
 * - Ignores client-supplied roleCode / companyId for authorization.
 * - Production: JWT required; profile matched strictly by auth_user_id.
 */
export async function mintTrustedSession(input: SessionMintRequest): Promise<SessionMintResult> {
  const method = input.method === 'phone' ? 'phone' : 'email';
  const claimedEmail = String(input.email || '')
    .trim()
    .toLowerCase();
  const claimedUserId = String(input.userId || '').trim();

  // Production Supabase path: require a verified Auth token when configured
  if (isSupabaseConfigured && !isDemoMode) {
    const token = String(input.accessToken || '').trim();
    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user?.id) {
        return { ok: false, error: 'Invalid or expired auth token', status: 401 };
      }

      const user = await loadUserByAuthUserIdTrusted(data.user.id, token);

      if (!user) {
        return {
          ok: false,
          error: 'No employee profile linked to this auth account',
          status: 403,
        };
      }

      if (!isUserRowUsable(user)) {
        return { ok: false, error: 'Account disabled', status: 403 };
      }

      // Strict link: profile.auth_user_id must equal verified Auth user id
      if (!user.auth_user_id || user.auth_user_id !== data.user.id) {
        return { ok: false, error: 'auth_user_id mismatch', status: 403 };
      }

      if (claimedUserId && claimedUserId !== user.id) {
        return { ok: false, error: 'User identity mismatch', status: 403 };
      }

      const payload = toPayload(user, method, input.loggedInAt);
      return { ok: true, payload, cookieValue: encodeCookiePayload(payload) };
    }

    // Without access token: only allow in demo-allowed environments (Pages / explicit demo)
    if (!isDemoAllowed()) {
      return {
        ok: false,
        error: 'accessToken required to establish session',
        status: 401,
      };
    }
  }

  // Demo / local / Pages fallback — still load role & company from store, never from body
  if (!claimedUserId && !claimedEmail) {
    return { ok: false, error: 'session payload required', status: 400 };
  }

  let user: TrustedUserRow | null = null;
  if (claimedUserId) user = await loadUserByIdTrusted(claimedUserId);
  if (!user && claimedEmail) user = await loadUserByEmailTrusted(claimedEmail);

  if (!isUserRowUsable(user)) {
    return { ok: false, error: 'User not found or inactive', status: 401 };
  }

  if (claimedEmail && claimedEmail !== user.email.toLowerCase()) {
    return { ok: false, error: 'Email identity mismatch', status: 403 };
  }

  const payload = toPayload(user, method, input.loggedInAt);
  return { ok: true, payload, cookieValue: encodeCookiePayload(payload) };
}
