/**
 * Re-validate signed cookie claims against the live users table.
 * Cookie roleCode/companyId alone must not authorize for up to 7 days.
 *
 * Production (Node/Vercel without service role): prefer verified Bearer JWT +
 * user-scoped Supabase client so RLS sees auth.uid(). Never use cookie userId
 * + anonymous client as the primary Production lookup.
 *
 * Production tenant link is users.company_id (no tenant_memberships table).
 */

import type { CookieSessionPayload } from '@/lib/auth/session-cookie';
import {
  isUserRowUsable,
  loadUserByAuthUserIdTrusted,
  loadUserByIdTrusted,
  type TrustedUserRow,
} from '@/lib/auth/trusted-user';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  createUserScopedSupabase,
  getTrustedServerSupabase,
  hasServiceRoleKey,
} from '@/lib/supabase/server';
import { isSuperAdminRole } from '@/lib/tenant/rbac';

export type LiveActor = {
  user: TrustedUserRow;
  /** Effective role from DB (not cookie) */
  roleCode: string;
  /** Effective company from DB (not cookie), unless platform support override applied later */
  companyId: string;
  isPlatformAdmin: boolean;
  memberships: Array<{ company_id: string; status: string; role_code?: string; is_default?: boolean }>;
};

export class ActorValidationError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export type ResolveLiveActorOptions = {
  /** Verified Supabase Auth access token from Authorization: Bearer */
  accessToken?: string | null;
};

/** Synthesize memberships from users.company_id (prod schema). */
async function loadActiveMemberships(
  userId: string,
  accessToken?: string | null
): Promise<LiveActor['memberships']> {
  try {
    const scoped = accessToken ? createUserScopedSupabase(accessToken) : null;
    const db = scoped || getTrustedServerSupabase();
    if (!db || typeof db.from !== 'function') return [];

    const { data, error } = await db
      .from('users')
      .select('company_id, role_code, is_active, deleted_at')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return [];
    if (data.is_active === false || data.deleted_at) return [];
    if (!data.company_id) return [];

    return [
      {
        company_id: String(data.company_id),
        status: 'active',
        role_code: String(data.role_code || 'staff'),
        is_default: true,
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Load current actor from DB. Rejects disabled / deleted users.
 * Overwrites cookie role & company with live values.
 *
 * When `accessToken` is present (preferred Production path):
 *   verify JWT → load users by auth_user_id with user-scoped client → enforce active row.
 * Cookie-only path remains for demo / service-role hosts.
 */
export async function resolveLiveActor(
  session: CookieSessionPayload,
  opts?: ResolveLiveActorOptions
): Promise<LiveActor> {
  const token = String(opts?.accessToken || '').trim();
  let user: TrustedUserRow | null = null;

  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.id) {
      throw new ActorValidationError('Invalid or expired auth token', 401);
    }

    const authUserId = data.user.id;
    user = await loadUserByAuthUserIdTrusted(authUserId, token);

    if (!user) {
      throw new ActorValidationError('No employee profile linked to this auth account', 403);
    }
    if (user.deleted_at) {
      throw new ActorValidationError('Account deleted', 403);
    }
    if (!user.is_active) {
      throw new ActorValidationError('Account disabled', 403);
    }
    if (!isUserRowUsable(user)) {
      throw new ActorValidationError('Account disabled', 403);
    }
    if (!user.auth_user_id || user.auth_user_id !== authUserId) {
      throw new ActorValidationError('auth_user_id mismatch', 403);
    }
    // Signed cookie may identify the app user, but must match the JWT-linked row.
    if (session.userId && session.userId !== user.id) {
      throw new ActorValidationError('User identity mismatch', 403);
    }
  } else {
    // Cookie-only: works with service role or demo memory. On Production Node
    // without service role, anon RLS cannot load users by id — require Bearer.
    if (
      isSupabaseConfigured &&
      !isDemoMode &&
      !hasServiceRoleKey() &&
      process.env.NODE_ENV === 'production'
    ) {
      throw new ActorValidationError(
        'Bearer access token required for live identity validation',
        401
      );
    }

    user = await loadUserByIdTrusted(session.userId);
    if (!isUserRowUsable(user)) {
      throw new ActorValidationError('Account disabled or not found', 403);
    }
  }

  const memberships = await loadActiveMemberships(user.id, token || null);
  const isPlatform = isSuperAdminRole(user.role_code);

  let companyId = user.company_id || '';
  if (!companyId && memberships.length) {
    const def = memberships.find((m) => m.is_default) || memberships[0];
    companyId = def ? String(def.company_id) : '';
  }

  // Cookie may still hold a previous company after tenant switch — only allow if
  // membership is still active (or platform admin).
  if (session.companyId && session.companyId !== companyId) {
    const memberOk = memberships.some((m) => String(m.company_id) === session.companyId);
    if (isPlatform || memberOk) {
      companyId = session.companyId;
    }
  }

  if (!isPlatform && companyId) {
    const memberOk =
      memberships.some((m) => String(m.company_id) === companyId) ||
      user.company_id === companyId;
    if (!memberOk && memberships.length > 0) {
      throw new ActorValidationError('Not an active member of this tenant', 403);
    }
  }

  return {
    user,
    roleCode: user.role_code,
    companyId,
    isPlatformAdmin: isPlatform,
    memberships,
  };
}

/** Merge live actor fields onto the session object used by downstream handlers. */
export function applyLiveActorToSession(
  session: CookieSessionPayload,
  actor: LiveActor
): CookieSessionPayload {
  return {
    ...session,
    roleCode: actor.roleCode,
    companyId: actor.companyId || session.companyId,
    email: actor.user.email || session.email,
    fullName: actor.user.full_name || session.fullName,
  };
}
