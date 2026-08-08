import type { AppRole, AppUser, AuthSession, DemoCredential, PermissionCode } from '@/lib/auth/types';
import { resolveUserPermissions } from '@/lib/auth/permissions';
import { clearSession, loadSession, saveSession } from '@/lib/auth/session';
import { isDemoMode, supabase } from '@/lib/supabase';

/** Demo / bootstrap defaults — production uses the actor's session company */
const DEMO_COMPANY_ID = 'co-tawaqqa';
const DEMO_BRANCH_ID = 'br-hq';
const BOOTSTRAP_COMPANY_CODE = process.env.DEFAULT_TENANT_CODE || 'TWAQQA';
const AUTH_TIMEOUT_MS = 12_000;

type AuthResult = { session: AuthSession | null; error: string | null; demoOtp?: string };

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Saudi mobile (05xxxxxxxx) or international E.164-ish (+... / 00...) */
function isValidPhone(phone: string): boolean {
  if (/^05\d{8}$/.test(phone)) return true;
  if (/^\+?[1-9]\d{7,14}$/.test(phone.replace(/[\s-]/g, ''))) return true;
  return false;
}

async function resolveTenantIds(preferredCompanyId?: string | null): Promise<{
  companyId: string;
  branchId: string | null;
  error: string | null;
}> {
  if (isDemoMode) {
    return {
      companyId: preferredCompanyId || loadSession()?.companyId || DEMO_COMPANY_ID,
      branchId: DEMO_BRANCH_ID,
      error: null,
    };
  }

  const sessionCompanyId = preferredCompanyId || loadSession()?.companyId || null;
  if (sessionCompanyId) {
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('company_id', sessionCompanyId)
      .eq('code', 'HQ')
      .maybeSingle();
    return {
      companyId: sessionCompanyId,
      branchId: (branch?.id as string) || null,
      error: null,
    };
  }

  // Bootstrap fallback for first install / migration only
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id')
    .eq('code', BOOTSTRAP_COMPANY_CODE)
    .maybeSingle();

  if (companyError || !company?.id) {
    return {
      companyId: '',
      branchId: null,
      error: 'Unable to resolve company. Sign in with a tenant membership or set DEFAULT_TENANT_CODE.',
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
  const isPlatformAdmin =
    user.role_code === 'super_admin' || Boolean((user as { is_platform_admin?: boolean }).is_platform_admin);
  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    username: user.username,
    roleCode: user.role_code,
    permissions: isPlatformAdmin ? (['*', ...permissions] as PermissionCode[]) : permissions,
    phone: user.phone,
    companyId: user.company_id,
    isPlatformAdmin,
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
  saveSession(session, user.company_id);
  return { session, error: null };
}

export async function signInWithEmailPassword(email: string, password: string): Promise<AuthResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !password) {
    return { session: null, error: 'أدخل البريد الإلكتروني وكلمة المرور' };
  }

  try {
    if (!isDemoMode) {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        }),
        AUTH_TIMEOUT_MS,
        'auth_timeout'
      );
      if (error || !data.user) {
        return { session: null, error: error?.message || 'فشل تسجيل الدخول' };
      }
      const { data: profile } = await withTimeout(
        supabase.from('users').select('*').eq('auth_user_id', data.user.id).maybeSingle(),
        8000,
        'profile_timeout'
      );
      const user =
        (profile as AppUser | null) ??
        (await withTimeout(fetchUserByEmail(trimmedEmail), 8000, 'profile_timeout'));
      if (!user || !user.is_active) {
        return { session: null, error: 'لا يوجد ملف موظف مرتبط بهذا الحساب' };
      }
      const role = await withTimeout(
        fetchRole(user.role_code, user.company_id),
        5000,
        'role_timeout'
      ).catch(() => null);
      const permissions = resolveUserPermissions(user, role);
      const session = toSession(user, permissions, 'email');
      saveSession(session, user.company_id);
      // Never block login UI on last_login write (RLS / network can stall)
      void supabase.from('users').update({ last_login_at: session.loggedInAt }).eq('id', user.id);
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
    saveSession(session, user.company_id);
    void supabase.from('users').update({ last_login_at: session.loggedInAt }).eq('id', user.id);
    return { session, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('timeout')) {
      return {
        session: null,
        error: 'انتهت مهلة الاتصال بخادم الدخول. تحقق من الشبكة أو جرّب لاحقاً.',
      };
    }
    return { session: null, error: 'تعذر إكمال تسجيل الدخول. حاول مرة أخرى.' };
  }
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
    const e164 = `+966${normalized.slice(1)}`;
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    if (!error) {
      // Optional parallel WhatsApp/SMS webhook (Twilio/Unifonic/etc.) when configured
      await dispatchOtpWebhook(normalized, null, 'supabase_otp');
      return { error: null };
    }

    // Fallback: custom OTP + SMS/WhatsApp webhook when Supabase SMS provider is not configured
    const smsWebhook = process.env.SMS_OTP_WEBHOOK_URL || process.env.WHATSAPP_WEBHOOK_URL;
    if (smsWebhook) {
      const code = randomOtp();
      await supabase.from('demo_otps').upsert({
        id: `otp-${normalized}`,
        phone: normalized,
        code,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      });
      const dispatched = await dispatchOtpWebhook(normalized, code, 'custom_otp');
      if (!dispatched.ok) {
        return { error: dispatched.error || error.message };
      }
      return { error: null };
    }

    return { error: error.message };
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

async function dispatchOtpWebhook(
  phone05: string,
  code: string | null,
  mode: 'supabase_otp' | 'custom_otp'
): Promise<{ ok: boolean; error?: string }> {
  const webhook =
    process.env.SMS_OTP_WEBHOOK_URL ||
    process.env.WHATSAPP_WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_WHATSAPP_WEBHOOK_URL;
  if (!webhook) return { ok: true };

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SMS_OTP_WEBHOOK_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN
          ? {
              Authorization: `Bearer ${
                process.env.SMS_OTP_WEBHOOK_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN
              }`,
            }
          : {}),
      },
      body: JSON.stringify({
        channel: process.env.SMS_OTP_WEBHOOK_URL ? 'sms' : 'whatsapp',
        to: phone05,
        e164: `+966${phone05.slice(1)}`,
        template: 'tawaqqa_otp',
        code,
        mode,
        message: code
          ? `رمز التحقق لمنصة تَوَقَّعَ: ${code}`
          : 'تم إرسال رمز التحقق عبر مزوّد OTP',
      }),
    });
    if (!res.ok) return { ok: false, error: `OTP webhook HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'فشل إرسال OTP' };
  }
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
    if (!error && data.user) {
      const user = await fetchUserByPhone(normalized);
      if (!user || !user.is_active) {
        return { session: null, error: 'لا يوجد ملف موظف مرتبط بهذا الرقم' };
      }
      const role = await fetchRole(user.role_code, user.company_id);
      const permissions = resolveUserPermissions(user, role);
      const session = toSession(user, permissions, 'phone');
      saveSession(session, user.company_id);
      void supabase.from('users').update({ last_login_at: session.loggedInAt }).eq('id', user.id);
      return { session, error: null };
    }

    // Custom OTP webhook path (stored in demo_otps when Supabase SMS is unavailable)
    const customOk = await verifyStoredOtp(normalized, code.trim());
    if (customOk) {
      const user = await fetchUserByPhone(normalized);
      if (!user || !user.is_active) {
        return { session: null, error: 'لا يوجد ملف موظف مرتبط بهذا الرقم' };
      }
      const role = await fetchRole(user.role_code, user.company_id);
      const permissions = resolveUserPermissions(user, role);
      const session = toSession(user, permissions, 'phone');
      saveSession(session, user.company_id);
      void supabase.from('users').update({ last_login_at: session.loggedInAt }).eq('id', user.id);
      return { session, error: null };
    }

    return { session: null, error: error?.message || 'كود التحقق غير صحيح' };
  }

  const customOk = await verifyStoredOtp(normalized, code.trim());
  if (!customOk) {
    return { session: null, error: 'كود التحقق غير صحيح أو منتهٍ' };
  }

  const user = await fetchUserByPhone(normalized);
  if (!user || !user.is_active) {
    return { session: null, error: 'رقم الجوال غير مسجّل' };
  }
  const role = await fetchRole(user.role_code, user.company_id);
  const permissions = resolveUserPermissions(user, role);
  const session = toSession(user, permissions, 'phone');
  saveSession(session, user.company_id);
  void supabase.from('users').update({ last_login_at: session.loggedInAt }).eq('id', user.id);
  return { session, error: null };
}

async function verifyStoredOtp(phone: string, code: string): Promise<boolean> {
  const { data: otps } = await supabase
    .from('demo_otps')
    .select('*')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1);
  const latest = Array.isArray(otps) ? otps[0] : null;
  if (!latest || latest.code !== code) return false;
  if (new Date(String(latest.expires_at)).getTime() < Date.now()) return false;
  return true;
}

export async function signOutAuth(): Promise<void> {
  clearSession();
  if (!isDemoMode) {
    await supabase.auth.signOut();
  }
}

export async function listUsers(companyId?: string | null): Promise<AppUser[]> {
  const tenantId = companyId || loadSession()?.companyId || null;
  let query = supabase.from('users').select('*').order('created_at', { ascending: true });
  if (tenantId) query = query.eq('company_id', tenantId);
  const { data } = await query;
  return (data as AppUser[]) || [];
}

export async function listRoles(companyId?: string | null): Promise<AppRole[]> {
  const tenantId = companyId || loadSession()?.companyId || null;
  let query = supabase.from('roles').select('*').order('code', { ascending: true });
  if (tenantId) query = query.eq('company_id', tenantId);
  const { data } = await query;
  return (data as AppRole[]) || [];
}

export async function getUserProfile(userId: string): Promise<AppUser | null> {
  return fetchUserById(userId);
}

export async function upsertEmployee(input: {
  company_id?: string | null;
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
  if (phone && !isValidPhone(phone)) {
    return {
      user: null,
      error: 'رقم الجوال غير صالح — استخدم 05xxxxxxxx أو صيغة دولية مثل +62812…',
    };
  }

  const tenant = await resolveTenantIds(input.company_id || loadSession()?.companyId);
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

  try {
    const { canCreateUser } = await import('@/lib/tenant/limits');
    const limit = await canCreateUser(tenant.companyId);
    if (!limit.ok) return { user: null, error: limit.reason || 'User limit reached' };
  } catch {
    // limits module optional during early boot
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
    if (signUpError) {
      return { user: null, error: `تعذر إنشاء حساب الدخول: ${signUpError.message}` };
    }
    authUserId = signedUp.user?.id ?? null;
    payload.auth_user_id = authUserId;
    payload.password_hash = 'supabase-auth';
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
  try {
    const { ensureMembership } = await import('@/lib/tenant/service');
    await ensureMembership({
      userId: user.id,
      companyId: tenant.companyId,
      roleCode: String(payload.role_code || 'staff'),
      isDefault: true,
    });
  } catch {
    // membership table may be absent until 033 is applied
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
