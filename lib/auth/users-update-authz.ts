/**
 * Mirrors SQL 042/043 users UPDATE authorization (no RLS recursion).
 * Privileged fields: role_code, company_id, is_platform_admin.
 */

import { canManageUsersRole } from '@/lib/auth/rls-roles';
import { isSuperAdminRole } from '@/lib/tenant/rbac';

export type UserAuthzRow = {
  id: string;
  company_id: string;
  role_code: string;
  is_platform_admin?: boolean | null;
  full_name?: string;
  phone?: string | null;
  page_title?: string | null;
  page_bio?: string | null;
};

/** Fields a non-admin may change on their own row. */
export const USER_SELF_EDITABLE_FIELDS = [
  'full_name',
  'phone',
  'page_title',
  'page_bio',
  'username',
  'job_title',
] as const;

export type ActorAuthz = {
  userId: string;
  companyId: string;
  roleCode: string;
  isPlatformAdmin: boolean;
};

function privilegedUnchanged(before: UserAuthzRow, after: UserAuthzRow): boolean {
  return (
    before.role_code === after.role_code &&
    before.company_id === after.company_id &&
    Boolean(before.is_platform_admin) === Boolean(after.is_platform_admin)
  );
}

/**
 * Equivalent of app_can_update_user_row — used by tests and server checks.
 */
export function canUpdateUserRow(
  actor: ActorAuthz,
  before: UserAuthzRow,
  after: UserAuthzRow
): boolean {
  if (actor.isPlatformAdmin || isSuperAdminRole(actor.roleCode)) {
    return true;
  }

  if (canManageUsersRole(actor.roleCode)) {
    // Tenant admin: only users in their company; cannot move them to another company
    return (
      before.company_id === actor.companyId &&
      after.company_id === actor.companyId
    );
  }

  // Self: personal fields only — privileged columns must stay identical
  if (after.id !== actor.userId || before.id !== actor.userId) {
    return false;
  }
  return privilegedUnchanged(before, after);
}

export function assertNoUsersSelectInUpdatePolicy(sql: string): void {
  // Extract users_update_admin policy body (last occurrence wins)
  const matches = [
    ...sql.matchAll(
      /CREATE POLICY users_update_admin ON public\.users([\s\S]*?)(?:;[\s\n]*CREATE POLICY|;[\s\n]*END\s*\$\$)/gi
    ),
  ];
  if (!matches.length) {
    throw new Error('users_update_admin policy not found in SQL');
  }
  const body = matches[matches.length - 1]![1] || '';
  if (/FROM\s+public\.users\b/i.test(body) || /FROM\s+users\b/i.test(body)) {
    throw new Error('users_update_admin must not SELECT FROM public.users (RLS recursion risk)');
  }
  if (!/app_can_update_user_row\s*\(/.test(body)) {
    throw new Error('users_update_admin must use app_can_update_user_row helper');
  }
}
