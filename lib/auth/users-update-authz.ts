/**
 * Mirrors SQL 044 users INSERT/UPDATE authorization (DB is source of truth).
 * Blocks tenant_admin/admin from granting platform privileges.
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

const TENANT_ASSIGNABLE_ROLES = new Set([
  'tenant_admin',
  'admin',
  'manager',
  'engineer',
  'sales',
  'accountant',
  'employee',
  'staff',
  'viewer',
]);

export type ActorAuthz = {
  userId: string;
  companyId: string;
  roleCode: string;
  isPlatformAdmin: boolean;
};

export function isPlatformPrivilegeRole(roleCode: string | null | undefined): boolean {
  return roleCode === 'super_admin';
}

export function isTenantAssignableRole(roleCode: string | null | undefined): boolean {
  return TENANT_ASSIGNABLE_ROLES.has(roleCode || 'staff');
}

function hasPlatformPrivilege(row: Pick<UserAuthzRow, 'role_code' | 'is_platform_admin'>): boolean {
  return Boolean(row.is_platform_admin) || isPlatformPrivilegeRole(row.role_code);
}

function privilegedUnchanged(before: UserAuthzRow, after: UserAuthzRow): boolean {
  return (
    before.role_code === after.role_code &&
    before.company_id === after.company_id &&
    Boolean(before.is_platform_admin) === Boolean(after.is_platform_admin)
  );
}

function actorIsPlatform(actor: ActorAuthz): boolean {
  return actor.isPlatformAdmin || isSuperAdminRole(actor.roleCode);
}

/**
 * Equivalent of app_can_insert_user_row.
 */
export function canInsertUserRow(
  actor: ActorAuthz,
  row: Pick<UserAuthzRow, 'company_id' | 'role_code' | 'is_platform_admin'>
): boolean {
  if (actorIsPlatform(actor)) return true;

  if (!canManageUsersRole(actor.roleCode)) return false;
  if (row.company_id !== actor.companyId) return false;
  if (hasPlatformPrivilege(row)) return false;
  if (!isTenantAssignableRole(row.role_code || 'staff')) return false;
  return true;
}

/**
 * Equivalent of app_can_update_user_row — used by tests and server checks.
 */
export function canUpdateUserRow(
  actor: ActorAuthz,
  before: UserAuthzRow,
  after: UserAuthzRow
): boolean {
  if (actorIsPlatform(actor)) return true;

  if (canManageUsersRole(actor.roleCode)) {
    if (before.company_id !== actor.companyId) return false;
    if (after.company_id !== actor.companyId) return false;
    if (hasPlatformPrivilege(before)) return false;
    if (hasPlatformPrivilege(after)) return false;
    if (!isTenantAssignableRole(after.role_code || 'staff')) return false;
    return true;
  }

  // Self: personal fields only — privileged columns must stay identical
  if (after.id !== actor.userId || before.id !== actor.userId) {
    return false;
  }
  return privilegedUnchanged(before, after);
}

export function assertNoUsersSelectInUpdatePolicy(sql: string): void {
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

export function assertInsertPolicyUsesHelper(sql: string): void {
  const matches = [
    ...sql.matchAll(
      /CREATE POLICY users_insert_admin ON public\.users([\s\S]*?)(?:;[\s\n]*CREATE POLICY|;[\s\n]*END\s*\$\$)/gi
    ),
  ];
  if (!matches.length) {
    throw new Error('users_insert_admin policy not found in SQL');
  }
  const body = matches[matches.length - 1]![1] || '';
  if (!/app_can_insert_user_row\s*\(/.test(body)) {
    throw new Error('users_insert_admin must use app_can_insert_user_row helper');
  }
  if (/FROM\s+public\.users\b/i.test(body) || /FROM\s+users\b/i.test(body)) {
    throw new Error('users_insert_admin must not SELECT FROM public.users');
  }
}
