/**
 * Mirrors SQL 042 role gates for server-side checks / tests.
 * Source of truth for Postgres is scripts/sql/042_role_level_rls.sql.
 */

import { isSuperAdminRole, isTenantAdminRole, normalizeSaasRole } from '@/lib/tenant/rbac';

const FINANCE_READ = new Set([
  'super_admin',
  'tenant_admin',
  'admin',
  'accountant',
  'manager',
]);

const FINANCE_WRITE = new Set(['super_admin', 'tenant_admin', 'admin', 'accountant']);

export function canManageUsersRole(roleCode: string): boolean {
  return isSuperAdminRole(roleCode) || isTenantAdminRole(roleCode);
}

export function canReadFinanceRole(roleCode: string): boolean {
  const n = normalizeSaasRole(roleCode);
  return FINANCE_READ.has(roleCode) || FINANCE_READ.has(n);
}

export function canWriteFinanceRole(roleCode: string): boolean {
  const n = normalizeSaasRole(roleCode);
  return FINANCE_WRITE.has(roleCode) || FINANCE_WRITE.has(n);
}

export function canManageTenantSettingsRole(roleCode: string): boolean {
  return isSuperAdminRole(roleCode) || isTenantAdminRole(roleCode);
}

/** Staff/sales/engineer must not mutate finance or admin control-plane tables. */
export function assertRoleAllowsFinanceWrite(roleCode: string): boolean {
  return canWriteFinanceRole(roleCode);
}
