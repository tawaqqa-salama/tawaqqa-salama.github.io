-- ============================================================================
-- 043 — Fix users UPDATE RLS recursion
-- Replaces users_update_admin WITH CHECK that selected from public.users
-- (causes infinite RLS recursion) with SECURITY DEFINER helpers.
-- Safe to re-run. No destructive changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.app_users_self_update_ok(
  p_role_code text,
  p_company_id uuid,
  p_is_platform_admin boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.deleted_at IS NULL
      AND u.is_active = true
      AND u.role_code IS NOT DISTINCT FROM p_role_code
      AND u.company_id IS NOT DISTINCT FROM p_company_id
      AND COALESCE(u.is_platform_admin, false)
            IS NOT DISTINCT FROM COALESCE(p_is_platform_admin, false)
  );
$$;

CREATE OR REPLACE FUNCTION public.app_can_update_user_row(
  p_target_id uuid,
  p_new_role_code text,
  p_new_company_id uuid,
  p_new_is_platform_admin boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN public.is_platform_admin() THEN true
      WHEN public.app_can_manage_users()
           AND p_new_company_id IS NOT DISTINCT FROM public.current_app_company_id()
           AND EXISTS (
             SELECT 1 FROM public.users t
             WHERE t.id = p_target_id
               AND t.company_id = public.current_app_company_id()
           )
        THEN true
      WHEN p_target_id IS NOT DISTINCT FROM public.current_app_user_id()
           AND public.app_users_self_update_ok(
             p_new_role_code,
             p_new_company_id,
             p_new_is_platform_admin
           )
        THEN true
      ELSE false
    END;
$$;

REVOKE ALL ON FUNCTION public.app_users_self_update_ok(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_update_user_row(uuid, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_users_self_update_ok(text, uuid, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_update_user_row(uuid, text, uuid, boolean)
  TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS users_update_admin ON public.users;

  CREATE POLICY users_update_admin ON public.users
    FOR UPDATE TO authenticated
    USING (
      public.is_platform_admin()
      OR (
        company_id = public.current_app_company_id()
        AND public.app_can_manage_users()
      )
      OR id = public.current_app_user_id()
    )
    WITH CHECK (
      public.app_can_update_user_row(
        id,
        role_code,
        company_id,
        COALESCE(is_platform_admin, false)
      )
    );
END $$;

COMMENT ON FUNCTION public.app_users_self_update_ok(text, uuid, boolean) IS
  '043: SECURITY DEFINER — self-update may not change role_code/company_id/is_platform_admin; avoids RLS recursion';
COMMENT ON FUNCTION public.app_can_update_user_row(uuid, text, uuid, boolean) IS
  '043: SECURITY DEFINER gate for users UPDATE policies (no users SELECT inside policies)';
