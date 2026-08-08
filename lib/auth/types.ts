import type { DepartmentId } from '@/lib/constants/navigation';

/** صلاحيات الأقسام والحوكمة */
export type PermissionCode =
  | '*'
  | `dept.${DepartmentId}`
  | 'users.manage'
  | 'me.page'
  | 'whatsapp.view'
  | 'whatsapp.send'
  | 'whatsapp.manage'
  | 'whatsapp.campaigns'
  | 'whatsapp.settings'
  | 'whatsapp.assign'
  | 'social.view'
  | 'social.manage'
  | 'social.publish'
  | 'social.accounts'
  | 'social.inbox'
  | 'social.campaigns'
  | 'social.analytics'
  | 'website.view'
  | 'website.manage'
  | 'website.publish'
  | 'website.forms'
  | 'website.settings'
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

export type AppRoleCode =
  | 'super_admin'
  | 'tenant_admin'
  | 'admin'
  | 'manager'
  | 'engineer'
  | 'sales'
  | 'accountant'
  | 'employee'
  | 'staff'
  | 'viewer';

export type AppUser = {
  id: string;
  company_id: string;
  branch_id?: string | null;
  auth_user_id?: string | null;
  email: string;
  full_name: string;
  phone?: string | null;
  username: string;
  role_code: AppRoleCode | string;
  job_title?: string | null;
  is_active: boolean;
  /** صلاحيات إضافية فوق الدور (اختياري) */
  extra_permissions?: PermissionCode[];
  /** أقسام تظهر في الصفحة الشخصية */
  page_modules?: DepartmentId[];
  page_title?: string | null;
  page_bio?: string | null;
  last_login_at?: string | null;
  created_at?: string;
  /** موارد بشرية */
  salary?: number | null;
  contract_type?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  hire_date?: string | null;
  national_id?: string | null;
  iban?: string | null;
  hr_notes?: string | null;
};

export type AppRole = {
  id: string;
  company_id: string | null;
  code: string;
  name: string;
  permissions: PermissionCode[];
  is_system?: boolean;
};

export type AuthSession = {
  userId: string;
  email: string;
  fullName: string;
  username: string;
  roleCode: string;
  permissions: PermissionCode[];
  phone?: string | null;
  /** Active tenant (companies.id) — required for tenant-scoped work */
  companyId?: string | null;
  isPlatformAdmin?: boolean;
  loggedInAt: string;
  method: 'email' | 'phone';
};

export type DemoCredential = {
  user_id: string;
  email: string;
  phone: string;
  /** للوضع التجريبي فقط — لا تُستخدم مع Supabase الحقيقي */
  password: string;
};
