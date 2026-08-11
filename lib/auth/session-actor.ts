/**
 * Re-validate signed cookie claims against the live users / memberships tables.
 * Cookie roleCode/companyId alone must not authorize for up to 7 days.
 */

import type { CookieSessionPayload } from '@/lib/auth/session-cookie';
import {
  isUserRowUsable,
  loadUserByIdTrusted,
  type TrustedUserRow,
} from '@/lib/auth/trusted-user';
import { getTrustedServerSupabase } from '@/lib/supabase/server';
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

async function loadActiveMemberships(userId: string) {
  const db = getTrustedServerSupabase();
  const { data, error } = await db
    .from('tenant_memberships')
    .select('company_id, status, role_code, is_default')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) {
    // Table may be absent until 033 — fall back to empty and rely on users.company_id
    return [] as LiveActor['memberships'];
  }
  return (data || []) as LiveActor['memberships'];
}

/**
 * Load current actor from DB. Rejects disabled / deleted users.
 * Overwrites cookie role & company with live values.
 */
export async function resolveLiveActor(session: CookieSessionPayload): Promise<LiveActor> {
  const user = await loadUserByIdTrusted(session.userId);
  if (!isUserRowUsable(user)) {
    throw new ActorValidationError('Account disabled or not found', 403);
  }

  const memberships = await loadActiveMemberships(user.id);
  const isPlatform =
    Boolean(user.is_platform_admin) || isSuperAdminRole(user.role_code);

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
