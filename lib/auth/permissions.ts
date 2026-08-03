import type { DepartmentId } from '@/lib/constants/navigation';
import type { AppRole, AppUser, PermissionCode } from '@/lib/auth/types';

export const ALL_DEPARTMENTS: DepartmentId[] = [
  'marketing',
  'sales',
  'procurement',
  'finance',
  'hr',
  'projects',
  'design',
  'settings',
];

export const DEPARTMENT_PERMISSIONS: { code: PermissionCode; label: string; department: DepartmentId }[] =
  ALL_DEPARTMENTS.map((department) => ({
    department,
    code: `dept.${department}` as PermissionCode,
    label:
      department === 'marketing'
        ? 'التسويق'
        : department === 'sales'
          ? 'المبيعات'
          : department === 'procurement'
            ? 'المشتريات'
            : department === 'finance'
              ? 'المالية'
              : department === 'hr'
                ? 'الموارد البشرية'
                : department === 'projects'
                  ? 'المشاريع'
                  : department === 'design'
                    ? 'الذكاء التصميمي'
                    : 'الإعدادات',
  }));

export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionCode[]> = {
  admin: ['*'],
  engineer: ['dept.projects', 'dept.design', 'dept.hr', 'dept.procurement', 'me.page'],
  sales: ['dept.marketing', 'dept.sales', 'dept.procurement', 'me.page'],
  accountant: ['dept.finance', 'me.page'],
  staff: ['me.page'],
};

export function normalizePermissions(list: unknown): PermissionCode[] {
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is PermissionCode => typeof item === 'string');
}

export function resolveUserPermissions(user: AppUser, role?: AppRole | null): PermissionCode[] {
  const fromRole =
    role?.permissions?.length
      ? normalizePermissions(role.permissions)
      : DEFAULT_ROLE_PERMISSIONS[user.role_code] ?? ['me.page'];
  const extra = normalizePermissions(user.extra_permissions);
  const merged = [...fromRole, ...extra, 'me.page' as PermissionCode];
  return Array.from(new Set(merged));
}

export function hasPermission(permissions: PermissionCode[] | undefined, needed: PermissionCode): boolean {
  if (!permissions?.length) return false;
  if (permissions.includes('*')) return true;
  return permissions.includes(needed);
}

export function canAccessDepartment(
  permissions: PermissionCode[] | undefined,
  department: DepartmentId
): boolean {
  return hasPermission(permissions, '*') || hasPermission(permissions, `dept.${department}`);
}

export function canManageUsers(permissions: PermissionCode[] | undefined): boolean {
  return hasPermission(permissions, '*') || hasPermission(permissions, 'users.manage');
}

export function departmentsFromPermissions(permissions: PermissionCode[] | undefined): DepartmentId[] {
  if (!permissions?.length) return [];
  if (permissions.includes('*')) return [...ALL_DEPARTMENTS];
  return ALL_DEPARTMENTS.filter((dept) => permissions.includes(`dept.${dept}`));
}
