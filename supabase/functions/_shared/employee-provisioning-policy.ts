export type ProvisionInput = {
  full_name: string;
  email: string;
  phone?: string;
  username: string;
  role_code?: string;
  job_title?: string;
  password?: string;
  extra_permissions?: string[];
  page_modules?: string[];
  page_title?: string;
  page_bio?: string;
  is_active?: boolean;
};

export type EmployeeActor = {
  company_id: string | null;
  role_code: string | null;
  is_active: boolean | null;
  deleted_at: string | null;
};

export type EmployeeProfileLink = {
  company_id: string | null;
};

export const TENANT_ASSIGNABLE_EMPLOYEE_ROLES = new Set([
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

export const EMPLOYEE_DEPARTMENTS = new Set([
  'marketing',
  'sales',
  'procurement',
  'finance',
  'hr',
  'projects',
  'design',
  'settings',
]);

export function normaliseEmployeeProvisionInput(value: Record<string, unknown>): ProvisionInput | null {
  const stringValue = (item: unknown, max = 240) => typeof item === 'string' ? item.trim().slice(0, max) : '';
  const stringArray = (item: unknown, max = 32) => Array.isArray(item)
    ? [...new Set(item.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean))].slice(0, max)
    : [];

  const full_name = stringValue(value.full_name, 160);
  const email = stringValue(value.email, 320).toLowerCase();
  const username = stringValue(value.username, 64).toLowerCase();
  const phone = stringValue(value.phone, 32).replace(/\s+/g, '');
  const role_code = stringValue(value.role_code, 32) || 'staff';
  const password = stringValue(value.password, 256);
  const extra_permissions = stringArray(value.extra_permissions)
    .filter((permission) => permission.startsWith('dept.') && EMPLOYEE_DEPARTMENTS.has(permission.slice(5)));
  const page_modules = stringArray(value.page_modules)
    .filter((department) => EMPLOYEE_DEPARTMENTS.has(department));

  if (!full_name || !email || !username) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (!/^[a-z0-9_-]{2,64}$/.test(username)) return null;
  if (!TENANT_ASSIGNABLE_EMPLOYEE_ROLES.has(role_code)) return null;
  if (phone && !(/^05\d{8}$/.test(phone) || /^\+?[1-9]\d{7,14}$/.test(phone))) return null;

  return {
    full_name,
    email,
    username,
    phone: phone || undefined,
    role_code,
    password: password || undefined,
    job_title: stringValue(value.job_title, 160) || undefined,
    extra_permissions,
    page_modules,
    page_title: stringValue(value.page_title, 160) || undefined,
    page_bio: stringValue(value.page_bio, 2000) || undefined,
    is_active: typeof value.is_active === 'boolean' ? value.is_active : true,
  };
}

export function actorCanManageEmployeeProvisioning(actor: EmployeeActor): boolean {
  return actor.is_active !== false
    && !actor.deleted_at
    && Boolean(actor.company_id)
    && (actor.role_code === 'super_admin' || actor.role_code === 'tenant_admin' || actor.role_code === 'admin');
}

export function existingEmployeeConflict(
  profile: EmployeeProfileLink | null | undefined,
  companyId: string,
): 'same_company' | 'foreign_company' | null {
  if (!profile) return null;
  return profile.company_id === companyId ? 'same_company' : 'foreign_company';
}
