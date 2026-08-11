/**
 * Server-side session minting: never trust browser roleCode / companyId.
 * Role and tenant are loaded from the database (or demo store) after Auth verification.
 */

import {
  encodeCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';
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
  /** Supabase Auth access token — preferred proof of identity when configured */
  accessToken?: string;
};

export type SessionMintResult =
  | { ok: true; payload: CookieSessionPayload; cookieValue: string }
  | { ok: false; error: string; status: number };

type TrustedUserRow = {
  id: string;
  email: string;
  full_name: string;
  role_code: string;
  company_id: string;
  is_active: boolean;
  is_platform_admin?: boolean | null;
  auth_user_id?: string | null;
};

async function loadUserById(userId: string): Promise<TrustedUserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role_code, company_id, is_active, is_platform_admin, auth_user_id')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TrustedUserRow;
}

async function loadUserByAuthId(authUserId: string): Promise<TrustedUserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role_code, company_id, is_active, is_platform_admin, auth_user_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TrustedUserRow;
}

async function loadUserByEmail(email: string): Promise<TrustedUserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role_code, company_id, is_active, is_platform_admin, auth_user_id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (error || !data) return null;
  return data as TrustedUserRow;
}

function toPayload(
  user: TrustedUserRow,
  method: 'email' | 'phone',
  loggedInAt?: string
): CookieSessionPayload {
  const roleCode =
    user.is_platform_admin || user.role_code === 'super_admin'
      ? user.role_code === 'super_admin'
        ? 'super_admin'
        : user.role_code
      : user.role_code;

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
 * - With Supabase: verifies accessToken when provided; otherwise demo/local path.
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
      if (error || !data.user) {
        return { ok: false, error: 'Invalid or expired auth token', status: 401 };
      }

      const user =
        (await loadUserByAuthId(data.user.id)) ||
        (data.user.email ? await loadUserByEmail(data.user.email) : null);

      if (!user || !user.is_active) {
        return { ok: false, error: 'No active employee profile for this account', status: 403 };
      }

      // Optional consistency checks — never elevate from client claims
      if (claimedUserId && claimedUserId !== user.id) {
        return { ok: false, error: 'User identity mismatch', status: 403 };
      }
      if (claimedEmail && claimedEmail !== user.email.toLowerCase()) {
        return { ok: false, error: 'Email identity mismatch', status: 403 };
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
  if (claimedUserId) user = await loadUserById(claimedUserId);
  if (!user && claimedEmail) user = await loadUserByEmail(claimedEmail);

  if (!user || !user.is_active) {
    return { ok: false, error: 'User not found or inactive', status: 401 };
  }

  if (claimedEmail && claimedEmail !== user.email.toLowerCase()) {
    return { ok: false, error: 'Email identity mismatch', status: 403 };
  }

  const payload = toPayload(user, method, input.loggedInAt);
  return { ok: true, payload, cookieValue: encodeCookiePayload(payload) };
}
