import type { AppRole, AppUser, AuthSession, DemoCredential, PermissionCode } from '@/lib/auth/types';
import { resolveUserPermissions } from '@/lib/auth/permissions';
import { clearSession, loadSession, saveSession } from '@/lib/auth/session';
import { isDemoMode, supabase } from '@/lib/supabase';

/** معرفات الوضع التجريبي فقط — في Supabase الحقيقي تُجلب من جدول companies */
const DEMO_COMPANY_ID = 'co-tawaqqa';
const DEMO_BRANCH_ID = 'br-hq';
const COMPANY_CODE = 'TWAQQA';

type AuthResult = { session: AuthSession | null; error: string | null; demoOtp?: string };

async function resolveTenantIds(): Promise<{
  companyId: string;
  branchId: string | null;
  error: string | null;
}> {
  if (isDemoMode) {
    return { companyId: DEMO_COMPANY_ID, branchId: DEMO_BRANCH_ID, error: null };
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id')
    .eq('code', COMPANY_CODE)
    .maybeSingle();

  if (companyError || !company?.id) {
    return {
      companyId: '',
      branchId: null,
      error: 'تعذر العثور على الشركة في قاعدة البيانات. تأكد من وجود شركة برمز TWAQQA.',
    };
  }

  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('company_id', company.id)
    .eq('code', 'HQ')
    .maybeSingle();

  return { companyId: company.id as string, branchId: (branch?.id as string) || null, error: null };
}

function toSession(user: AppUser, permissions: PermissionCode[], method: 'email' | 'phone'): AuthSession {
  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    username: user.username,
    roleCode: user.role_code,
    permissions,
    phone: user.phone,
    loggedInAt: new Date().toISOString(),
    method,
  };
}

async function fetchUserByEmail(email: string): Promise<AppUser | null> {
  const { data } = await supabase.from('users').select('*').eq('email', email.trim().toLowerCase()).maybeSingle();
  return (data as AppUser | null) ?? null;
}

async function fetchUserByPhone(phone: string): Promise<AppUser | null> {
  const normalized = phone.replace(/\s+/g, '');
  const { data } = await supabase.from('users').select('*').eq('phone', normalized).maybeSingle();
  return (data as AppUser | null) ?? null;
}

async function fetchUserById(id: string): Promise<AppUser | null> {
  const { data } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  return (data as AppUser | null) ?? null;
}

async function fetchRole(roleCode: string, companyId: string): Promise<AppRole | null> {
  const { data } = await supabase
    .from('roles')
    .select('*')
    .eq('code', roleCode)
    .eq('company_id', companyId)
    .maybeSingle();
  return (data as AppRole | null) ?? null;
}

async function getCredential(userId: string): Promise<DemoCredential | null> {
  const { data } = await supabase.from('demo_credentials').select('*').eq('user_id', userId).maybeSingle();
  return (data as DemoCredential | null) ?? null;
}

export async function restoreAuthSession(): Promise<AuthResult> {
  const existing = loadSession();
  if (!existing) return { session: null, error: null };

  const user = await fetchUserById(existing.userId);
  if (!user || !user.is_active) {
    clearSession();
    return { session: null, error: null };
  }

  const role = await fetchRole(user.role_code, user.company_id);
  const permissions = resolveUserPermissions(user, role);
  const session = toSession(user, permissions, existing.method);
  saveSession(session);
  return { session, error: null };
}

function mapAuthError(message: string | null | undefined, fallback: string): string {
  const raw = (message || '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();

  if (lower.includes('email not confirmed')) {
    return 'البريد غير مفعّل بعد. اطلب من المدير إعادة حفظ الموظف من شاشة المستخدمين لتفعيل الحساب، أو أكّد الإيميل من Supabase → Authentication → Users.';
  }
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid credentials') ||
    lower.includes('invalid email or password')
  ) {
    return 'بيانات الدخول غير صحيحة';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'هذا البريد مسجّل مسبقاً في نظام الدخول.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.';
  }

  return raw;
}

async function provisionEmployeeAuth(email: string, password: string): Promise<{
  authUserId: string | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('provision_employee_auth', {
    p_email: email,
    p_password: password,
  });

  if (error) {
    const msg = error.message || '';
    if (/could not find the function|does not exist|42883/i.test(msg)) {
      return {
        authUserId: null,
        error:
          'يلزم تشغيل سكربت تفعيل البريد في Supabase أولاً: scripts/sql/015_provision_employee_auth.sql',
      };
    }
    return { authUserId: null, error: mapAuthError(msg, 'تعذر تفعيل حساب الدخول') };
  }

  return { authUserId: (data as string | null) ?? null, error: null };
}

export async function signInWithEmailPassword(email: string, password: string): Promise<AuthResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !password) {
    return { session: null, error: 'أدخل البريد الإلكتروني وكلمة المرور' };
  }

  if (!isDemoMode) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (error || !data.user) {
      return { session: null, error: mapAuthError(error?.message, 'فشل تسجيل الدخول') };
    }
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();
    const user = (profile as AppUser | null) ?? (await fetchUserByEmail(trimmedEmail));
    if (!user || !user.is_active) {
      return { session: null, error: 'لا يوجد ملف موظف مرتبط بهذا الحساب' };
    }
    const role = await fetchRole(user.role_code, user.company_id);
    const permissions = resolveUserPermissions(user, role);
    const session = toSession(user, permissions, 'email');
    saveSession(session);
    await supabase.from('users').update({ last_login_at: session.loggedInAt }).eq('id', user.id);
    return { session, error: null };
  }

  const user = await fetchUserByEmail(trimmedEmail);
  if (!user || !user.is_active) {
    return { session: null, error: 'بيانات الدخول غير صحيحة' };
  }
  const cred = await getCredential(user.id);
  if (!cred || cred.password !== password) {
    return { session: null, error: 'بيانات الدخول غير صحيحة' };
  }
  const role = await fetchRole(user.role_code, user.company_id);
  const permissions = resolveUserPermissions(user, role);
  const session = toSession(user, permissions, 'email');
  saveSession(session);
  await supabase.from('users').update({ last_login_at: session.loggedInAt }).eq('id', user.id);
  return { session, error: null };
}

function randomOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function requestPhoneOtp(phone: string): Promise<{ error: string | null; demoOtp?: string }> {
  const normalized = phone.replace(/\s+/g, '');
  if (!/^05\d{8}$/.test(normalized)) {
    return { error: 'أدخل رقم جوال سعودي بصيغة 05xxxxxxxx' };
  }

  const user = await fetchUserByPhone(normalized);
  if (!user || !user.is_active) {
    return { error: 'رقم الجوال غير مسجّل لموظف نشط' };
  }

  if (!isDemoMode) {
    const { error } = await supabase.auth.signInWithOtp({ phone: `+966${normalized.slice(1)}` });
    if (error) return { error: error.message };
    return { error: null };
  }

  const code = randomOtp();
  await supabase.from('demo_otps').insert({
    id: `otp-${Date.now()}`,
    phone: normalized,
    code,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  });
  return { error: null, demoOtp: code };
}

export async function verifyPhoneOtp(phone: string, code: string): Promise<AuthResult> {
  const normalized = phone.replace(/\s+/g, '');
  if (!normalized || !code.trim()) {
    return { session: null, error: 'أدخل رقم الجوال وكود التحقق' };
  }

  if (!isDemoMode) {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: `+966${normalized.slice(1)}`,
      token: code.trim(),
      type: 'sms',
    });
    if (error || !data.user) {
      return { session: null, error: error?.message || 'كود التحقق غير صحيح' };
    }
    const user = await fetchUserByPhone(normalized);
    if (!user || !user.is_active) {
      return { session: null, error: 'لا يوجد ملف موظف مرتبط بهذا الرقم' };
    }
    const role = await fetchRole(user.role_code, user.company_id);
    const permissions = resolveUserPermissions(user, role);
    const session = toSession(user, permissions, 'phone');
    saveSession(session);
    await supabase.from('users').update({ last_login_at: session.loggedInAt }).eq('id', user.id);
    return { session, error: null };
  }

  const { data: otps } = await supabase
    .from('demo_otps')
    .select('*')
    .eq('phone', normalized)
    .order('created_at', { ascending: false })
    .limit(1);
  const latest = Array.isArray(otps) ? otps[0] : null;
  if (!latest || latest.code !== code.trim()) {
    return { session: null, error: 'كود التحقق غير صحيح' };
  }
  if (new Date(String(latest.expires_at)).getTime() < Date.now()) {
    return { session: null, error: 'انتهت صلاحية كود التحقق' };
  }

  const user = await fetchUserByPhone(normalized);
  if (!user || !user.is_active) {
    return { session: null, error: 'رقم الجوال غير مسجّل' };
  }
  const role = await fetchRole(user.role_code, user.company_id);
  const permissions = resolveUserPermissions(user, role);
  const session = toSession(user, permissions, 'phone');
  saveSession(session);
  await supabase.from('users').update({ last_login_at: session.loggedInAt }).eq('id', user.id);
  return { session, error: null };
}

export async function signOutAuth(): Promise<void> {
  clearSession();
  if (!isDemoMode) {
    await supabase.auth.signOut();
  }
}

export async function listUsers(): Promise<AppUser[]> {
  const { data } = await supabase.from('users').select('*').order('created_at', { ascending: true });
  return (data as AppUser[]) || [];
}

export async function listRoles(): Promise<AppRole[]> {
  const { data } = await supabase.from('roles').select('*').order('code', { ascending: true });
  return (data as AppRole[]) || [];
}

export async function getUserProfile(userId: string): Promise<AppUser | null> {
  return fetchUserById(userId);
}

export async function upsertEmployee(input: {
  id?: string;
  full_name: string;
  email: string;
  phone: string;
  username: string;
  role_code: string;
  job_title?: string;
  password?: string;
  extra_permissions?: PermissionCode[];
  page_modules?: AppUser['page_modules'];
  page_title?: string;
  page_bio?: string;
  is_active?: boolean;
  salary?: number | null;
  contract_type?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  hire_date?: string | null;
  national_id?: string | null;
  iban?: string | null;
  hr_notes?: string | null;
}): Promise<{ user: AppUser | null; error: string | null }> {
  const isUpdate = Boolean(input.id);
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.replace(/\s+/g, '');
  const username = input.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

  if (!input.full_name.trim() || !email || !username) {
    return { user: null, error: 'أكمل الاسم والبريد واسم المستخدم' };
  }
  if (!isUpdate && !phone) {
    return { user: null, error: 'أكمل رقم الجوال' };
  }
  if (phone && !/^05\d{8}$/.test(phone)) {
    return { user: null, error: 'رقم الجوال يجب أن يكون 05xxxxxxxx' };
  }

  const tenant = await resolveTenantIds();
  if (tenant.error || !tenant.companyId) {
    return { user: null, error: tenant.error || 'تعذر تحديد الشركة' };
  }

  const payload: Record<string, unknown> = {
    company_id: tenant.companyId,
    branch_id: tenant.branchId,
    full_name: input.full_name.trim(),
    email,
    username,
    role_code: input.role_code || 'staff',
    job_title: input.job_title?.trim() || null,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  };

  // عند التحديث: اسمح ببقاء الجوال فارغاً للموظفين القدامى
  if (phone) payload.phone = phone;
  else if (!isUpdate) payload.phone = phone;

  if (input.extra_permissions !== undefined) payload.extra_permissions = input.extra_permissions;
  if (input.page_modules !== undefined) payload.page_modules = input.page_modules;
  if (input.page_title !== undefined) payload.page_title = input.page_title?.trim() || null;
  if (input.page_bio !== undefined) payload.page_bio = input.page_bio?.trim() || null;

  if (input.salary !== undefined) payload.salary = input.salary;
  if (input.contract_type !== undefined) payload.contract_type = input.contract_type || null;
  if (input.contract_start_date !== undefined) payload.contract_start_date = input.contract_start_date || null;
  if (input.contract_end_date !== undefined) payload.contract_end_date = input.contract_end_date || null;
  if (input.hire_date !== undefined) payload.hire_date = input.hire_date || null;
  if (input.national_id !== undefined) payload.national_id = input.national_id || null;
  if (input.iban !== undefined) payload.iban = input.iban || null;
  if (input.hr_notes !== undefined) payload.hr_notes = input.hr_notes || null;

  if (isUpdate) {
    if (!isDemoMode && input.password && input.password.length >= 6) {
      const provisioned = await provisionEmployeeAuth(email, input.password);
      if (provisioned.error) return { user: null, error: provisioned.error };
      if (provisioned.authUserId) payload.auth_user_id = provisioned.authUserId;
    }

    const { data, error } = await supabase.from('users').update(payload).eq('id', input.id!).select('*').single();
    if (error) return { user: null, error: error.message };
    if (input.password && isDemoMode) {
      await supabase
        .from('demo_credentials')
        .update({ email, phone: phone || null, password: input.password })
        .eq('user_id', input.id!);
    }
    return { user: data as AppUser, error: null };
  }

  if (!input.password || input.password.length < 6) {
    return { user: null, error: 'كلمة المرور يجب ألا تقل عن 6 أحرف' };
  }

  let authUserId: string | null = null;
  if (!isDemoMode) {
    const { data: currentAuth } = await supabase.auth.getSession();
    const { data: signedUp, error: signUpError } = await supabase.auth.signUp({
      email,
      password: input.password,
    });
    // أعد جلسة المدير حتى لا يتحول الدخول إلى الموظف الجديد
    if (currentAuth.session) {
      await supabase.auth.setSession({
        access_token: currentAuth.session.access_token,
        refresh_token: currentAuth.session.refresh_token,
      });
    }

    const alreadyRegistered = Boolean(
      signUpError &&
        /already|registered|exists/i.test(signUpError.message || '')
    );

    if (signUpError && !alreadyRegistered) {
      return { user: null, error: `تعذر إنشاء حساب الدخول: ${mapAuthError(signUpError.message, signUpError.message)}` };
    }

    // فعّل البريد وأعد ضبط كلمة المرور (يحل Email not confirmed والحساب الموجود مسبقاً)
    const provisioned = await provisionEmployeeAuth(email, input.password);
    if (provisioned.error) {
      return { user: null, error: provisioned.error };
    }

    authUserId = provisioned.authUserId || signedUp.user?.id || null;
    if (!authUserId) {
      return {
        user: null,
        error: 'تعذر ربط حساب الدخول. تأكد من تشغيل سكربت 015_provision_employee_auth.sql ثم أعد المحاولة.',
      };
    }

    payload.auth_user_id = authUserId;
    payload.password_hash = 'supabase-auth';

    // إن كان ملف الموظف موجوداً سابقاً بسبب محاولة فاشلة: حدّثه بدلاً من إدراج جديد
    const existingProfile = await fetchUserByEmail(email);
    if (existingProfile) {
      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update(payload)
        .eq('id', existingProfile.id)
        .select('*')
        .single();
      if (updateError) return { user: null, error: updateError.message };
      return { user: updated as AppUser, error: null };
    }
  }

  const { data, error } = await supabase
    .from('users')
    .insert({
      ...payload,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) return { user: null, error: error.message };

  const user = data as AppUser;
  if (isDemoMode) {
    await supabase.from('demo_credentials').insert({
      user_id: user.id,
      email,
      phone,
      password: input.password,
    });
  }
  return { user, error: null };
}

export async function updateEmployeeHr(
  userId: string,
  input: {
    salary?: number | null;
    contract_type?: string | null;
    contract_start_date?: string | null;
    contract_end_date?: string | null;
    hire_date?: string | null;
    national_id?: string | null;
    iban?: string | null;
    hr_notes?: string | null;
    job_title?: string | null;
    is_active?: boolean;
  }
): Promise<{ user: AppUser | null; error: string | null }> {
  const payload = {
    salary: input.salary ?? null,
    contract_type: input.contract_type || null,
    contract_start_date: input.contract_start_date || null,
    contract_end_date: input.contract_end_date || null,
    hire_date: input.hire_date || null,
    national_id: input.national_id?.trim() || null,
    iban: input.iban?.trim() || null,
    hr_notes: input.hr_notes?.trim() || null,
    job_title: input.job_title?.trim() || null,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('users').update(payload).eq('id', userId).select('*').single();
  if (error) {
    if (error.message.includes('salary') || error.message.includes('column')) {
      return {
        user: null,
        error: 'حقول الموارد البشرية غير مفعّلة بعد. شغّل سكربت scripts/sql/012_hr_employee_fields.sql في Supabase.',
      };
    }
    return { user: null, error: error.message };
  }
  return { user: data as AppUser, error: null };
}

export const DEMO_LOGIN_HINTS = [
  { label: 'مدير النظام', email: 'admin@tawaqqa.sa', password: 'Admin@123', phone: '0599776676' },
  { label: 'مهندس', email: 'engineer@tawaqqa.sa', password: 'Eng@123', phone: '0500000002' },
  { label: 'مبيعات', email: 'sales@tawaqqa.sa', password: 'Sales@123', phone: '0500000003' },
  { label: 'محاسب', email: 'finance@tawaqqa.sa', password: 'Fin@123', phone: '0500000004' },
] as const;
