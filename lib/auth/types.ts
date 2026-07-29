import type { DepartmentId } from '@/lib/constants/navigation';

/** صلاحيات الأقسام والحوكمة */
export type PermissionCode =
  | '*'
  | `dept.${DepartmentId}`
  | 'users.manage'
  | 'me.page';

export type AppRoleCode = 'admin' | 'engineer' | 'sales' | 'accountant' | 'staff';

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
