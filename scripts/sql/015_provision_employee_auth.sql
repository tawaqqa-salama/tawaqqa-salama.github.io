-- تفعيل بريد الموظف وتعيين كلمة المرور من حساب المدير
-- يحل خطأ: Email not confirmed / User already registered

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.provision_employee_auth(
  p_email text,
  p_password text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_user_id uuid;
  v_email text := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول كمدير أولاً';
  END IF;

  SELECT u.role_code INTO v_caller_role
  FROM public.users u
  WHERE u.auth_user_id = v_caller
    AND u.is_active = true
    AND u.deleted_at IS NULL
  ORDER BY u.created_at
  LIMIT 1;

  -- إن لم يُربط auth_user_id بعد، جرّب بالبريد الحالي للجلسة
  IF v_caller_role IS NULL THEN
    SELECT u.role_code INTO v_caller_role
    FROM public.users u
    JOIN auth.users au ON lower(au.email) = lower(u.email)
    WHERE au.id = v_caller
      AND u.is_active = true
      AND u.deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'تفعيل حسابات الدخول متاح لمدير النظام فقط';
  END IF;

  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'البريد الإلكتروني غير صالح';
  END IF;

  IF p_password IS NULL OR char_length(p_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب ألا تقل عن 6 أحرف';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE auth.users
  SET
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
    updated_at = now()
  WHERE id = v_user_id;

  RETURN v_user_id;
END;
$$;

COMMENT ON FUNCTION public.provision_employee_auth(text, text) IS
  'يؤكد بريد الموظف ويعيد ضبط كلمة المرور — للمدير فقط';

GRANT EXECUTE ON FUNCTION public.provision_employee_auth(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_employee_auth(text, text) TO service_role;
