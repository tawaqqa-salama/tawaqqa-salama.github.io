/// <reference lib="deno.ns" />
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  actorCanManageEmployeeProvisioning,
  existingEmployeeConflict,
  normaliseEmployeeProvisionInput,
  type ProvisionInput,
} from '../_shared/employee-provisioning-policy.ts';

type AuthUser = { id: string; email?: string | null };

type AppUserRow = {
  id: string;
  company_id: string | null;
  auth_user_id: string | null;
  role_code: string | null;
  is_active: boolean | null;
  deleted_at: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function failure(code: string, message: string, status: number): Response {
  return json({ ok: false, code, message }, status);
}

function bearerToken(request: Request): string | null {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function publicUserPayload(input: ProvisionInput, companyId: string, branchId: string | null, authUserId: string) {
  return {
    company_id: companyId,
    branch_id: branchId,
    auth_user_id: authUserId,
    full_name: input.full_name,
    email: input.email,
    phone: input.phone || null,
    username: input.username,
    role_code: input.role_code || 'staff',
    job_title: input.job_title || null,
    extra_permissions: input.extra_permissions || [],
    page_modules: input.page_modules || [],
    page_title: input.page_title || null,
    page_bio: input.page_bio || null,
    is_active: input.is_active !== false,
    password_hash: 'supabase-auth',
  };
}

type AuthAdminLookupClient = {
  auth: {
    admin: {
      listUsers: (params: { page: number; perPage: number }) => Promise<{
        data: { users: AuthUser[] } | null;
        error: unknown;
      }>;
    };
  };
};

async function findAuthUserByEmail(
  admin: AuthAdminLookupClient,
  email: string,
): Promise<AuthUser | null> {
  // Supabase Admin exposes paginated listUsers rather than an email lookup.
  // Scan pages server-side only; no Auth-user data is returned to the browser.
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((user) => user.email?.trim().toLowerCase() === email);
    if (match) return match;
    if (users.length < 1000) return null;
  }
  throw new Error('AUTH_LOOKUP_PAGE_LIMIT');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return failure('METHOD_NOT_ALLOWED', 'يجب استخدام طلب POST.', 405);

  const token = bearerToken(request);
  if (!token) return failure('UNAUTHORIZED', 'سجّل الدخول ثم أعد المحاولة.', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return failure('FUNCTION_CONFIG_ERROR', 'تعذر إكمال العملية حاليًا. تواصل مع مدير المنصة.', 500);
  }

  let raw: Record<string, unknown>;
  try {
    raw = await request.json() as Record<string, unknown>;
  } catch {
    return failure('INVALID_INPUT', 'بيانات الموظف غير صالحة.', 400);
  }
  const input = normaliseEmployeeProvisionInput(raw);
  if (!input) return failure('INVALID_INPUT', 'تحقق من الاسم والبريد واسم المستخدم والدور والجوال.', 400);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return failure('UNAUTHORIZED', 'انتهت جلسة الدخول. سجّل الدخول ثم أعد المحاولة.', 401);

  // The requester company is resolved only from the verified JWT → public.users relation.
  const { data: actorData, error: actorError } = await admin
    .from('users')
    .select('id, company_id, auth_user_id, role_code, is_active, deleted_at')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  const actor = actorData as AppUserRow | null;
  if (actorError || !actor || actor.auth_user_id !== authData.user.id || !actorCanManageEmployeeProvisioning(actor)) {
    return failure('ACTOR_COMPANY_UNAVAILABLE', 'تعذر تحديد الشركة المرتبطة بحسابك أو التحقق من صلاحيتك.', 403);
  }
  const companyId = actor.company_id!;

  const { data: branchData } = await admin
    .from('branches')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', 'HQ')
    .maybeSingle();
  const branchId = typeof branchData?.id === 'string' ? branchData.id : null;

  const { data: existingProfile } = await admin
    .from('users')
    .select('id, company_id, auth_user_id, deleted_at')
    .eq('email', input.email)
    .maybeSingle();
  const emailConflict = existingEmployeeConflict(existingProfile, companyId);
  if (emailConflict === 'same_company') {
    return failure('EMPLOYEE_EXISTS_SAME_COMPANY', 'المستخدم موجود مسبقًا ضمن موظفي الشركة.', 409);
  }
  if (emailConflict === 'foreign_company') {
    return failure('EMPLOYEE_EXISTS_FOREIGN_COMPANY', 'هذا المستخدم مرتبط بشركة أخرى ولا يمكن إضافته.', 409);
  }

  let authUser = await findAuthUserByEmail(admin, input.email);
  let authCreatedByOperation = false;
  if (!authUser) {
    if (!input.password || input.password.length < 6) {
      return failure('PASSWORD_REQUIRED', 'كلمة المرور مطلوبة للحساب الجديد ويجب ألا تقل عن 6 أحرف.', 400);
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      // A concurrent request may have created the Auth account. Re-check before failing.
      authUser = await findAuthUserByEmail(admin, input.email);
      if (!authUser) return failure('AUTH_CREATE_FAILED', 'تعذر إنشاء حساب الدخول. حاول مرة أخرى.', 502);
    } else {
      authUser = { id: created.user.id, email: created.user.email };
      authCreatedByOperation = true;
    }
  }

  const { data: profileForAuth } = await admin
    .from('users')
    .select('id, company_id, auth_user_id, deleted_at')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  const authConflict = existingEmployeeConflict(profileForAuth, companyId);
  if (authConflict === 'same_company') {
    return failure('AUTH_PROFILE_EXISTS_SAME_COMPANY', 'المستخدم موجود مسبقًا ضمن موظفي الشركة.', 409);
  }
  if (authConflict === 'foreign_company') {
    return failure('AUTH_PROFILE_EXISTS_FOREIGN_COMPANY', 'هذا المستخدم مرتبط بشركة أخرى ولا يمكن إضافته.', 409);
  }

  const { data: employee, error: profileError } = await admin
    .from('users')
    .insert(publicUserPayload(input, companyId, branchId, authUser.id))
    .select('id, company_id, auth_user_id, full_name, email, phone, username, role_code, job_title, extra_permissions, page_modules, page_title, page_bio, is_active, created_at, updated_at, deleted_at')
    .single();
  if (profileError || !employee) {
    if (authCreatedByOperation) {
      // Do not delete an Auth account if a concurrent safe request linked it meanwhile.
      const { data: linkedProfile } = await admin
        .from('users')
        .select('id')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      if (!linkedProfile) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(authUser.id);
        if (cleanupError) console.error('employee profile creation failed; cleanup of newly created Auth user also failed');
      }
    }
    return failure('PROFILE_CREATE_FAILED', 'تعذر إكمال إنشاء ملف الموظف. لم يتم إنشاء موظف جديد.', 500);
  }

  return json({
    ok: true,
    status: authCreatedByOperation ? 'created_new_auth' : 'linked_existing_auth',
    message: authCreatedByOperation
      ? 'تمت إضافة الموظف بنجاح.'
      : 'تم العثور على حساب دخول موجود وربطه بملف الموظف.',
    user: employee,
  });
});
