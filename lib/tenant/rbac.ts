import type { PermissionCode } from '@/lib/auth/types';
import { hasPermission } from '@/lib/auth/permissions';

export function isSuperAdminRole(roleCode: string | null | undefined): boolean {
  return roleCode === 'super_admin';
}

export function isTenantAdminRole(roleCode: string | null | undefined): boolean {
  return roleCode === 'tenant_admin' || roleCode === 'admin';
}

export function normalizeSaasRole(roleCode: string): string {
  if (roleCode === 'admin') return 'tenant_admin';
  if (roleCode === 'staff') return 'employee';
  return roleCode;
}

/** Granular SaaS permission codes (extend legacy dept.* model). */
export type SaasPermissionCode =
  | PermissionCode
  | 'platform.tenants'
  | 'platform.subscriptions'
  | 'platform.modules'
  | 'platform.audit'
  | 'platform.impersonate'
  | 'projects.view'
  | 'projects.create'
  | 'projects.edit'
  | 'projects.delete'
  | 'clients.view'
  | 'clients.create'
  | 'clients.edit'
  | 'clients.delete'
  | 'crm.view'
  | 'crm.manage'
  | 'marketing.view'
  | 'marketing.manage'
  | 'documents.view'
  | 'documents.upload'
  | 'documents.delete'
  | 'reports.view'
  | 'reports.create'
  | 'reports.export'
  | 'users.view'
  | 'settings.view'
  | 'settings.manage';

export const SAAS_ROLE_PERMISSIONS: Record<string, SaasPermissionCode[]> = {
  super_admin: ['*'],
  tenant_admin: ['*'],
  admin: ['*'],
  manager: [
    'dept.marketing',
    'dept.sales',
    'dept.projects',
    'dept.procurement',
    'crm.view',
    'crm.manage',
    'projects.view',
    'projects.create',
    'projects.edit',
    'clients.view',
    'clients.create',
    'clients.edit',
    'marketing.view',
    'marketing.manage',
    'documents.view',
    'documents.upload',
    'reports.view',
    'reports.create',
    'users.view',
    'settings.view',
    'me.page',
  ],
  engineer: ['dept.projects', 'dept.design', 'dept.hr', 'dept.procurement', 'projects.view', 'projects.edit', 'documents.view', 'me.page'],
  sales: [
    'dept.marketing',
    'dept.sales',
    'dept.procurement',
    'crm.view',
    'crm.manage',
    'clients.view',
    'clients.create',
    'clients.edit',
    'marketing.view',
    'marketing.manage',
    'whatsapp.view',
    'whatsapp.send',
    'whatsapp.manage',
    'social.view',
    'website.view',
    'me.page',
  ],
  accountant: ['dept.finance', 'reports.view', 'reports.export', 'me.page'],
  employee: ['me.page', 'projects.view', 'documents.view'],
  staff: ['me.page'],
  viewer: ['me.page', 'projects.view', 'clients.view', 'reports.view'],
};

export function resolveSaasPermissions(roleCode: string, extra?: string[]): PermissionCode[] {
  const base = SAAS_ROLE_PERMISSIONS[normalizeSaasRole(roleCode)] || SAAS_ROLE_PERMISSIONS.staff;
  const merged = [...base, ...((extra || []) as PermissionCode[])];
  return Array.from(new Set(merged)) as PermissionCode[];
}

export function hasSaasPermission(
  permissions: PermissionCode[] | string[] | undefined,
  needed: SaasPermissionCode
): boolean {
  return hasPermission(permissions as PermissionCode[], needed as PermissionCode);
}
