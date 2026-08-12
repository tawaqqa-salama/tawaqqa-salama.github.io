-- ============================================================================
-- Users privilege-escalation lock (042 helpers + 044 gates)
-- Replaces weak users_insert_tenant / users_update_tenant WITH CHECK
-- that only checked company_id (allowed promoting to super_admin).
-- Production schema: users.company_id / role_code / is_platform_admin
-- No tenant_memberships.
-- Idempotent.
-- ============================================================================

-- ─── Role helpers ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_app_role_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (
      SELECT u.role_code
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.deleted_at IS NULL
        AND u.is_active = true
      LIMIT 1
    ),
    'staff'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_role_in(allowed text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_platform_admin()
    OR public.current_app_role_code() = ANY (allowed)
    OR (
      public.current_app_role_code() = 'admin'
      AND 'tenant_admin' = ANY (allowed)
    )
    OR (
      public.current_app_role_code() = 'tenant_admin'
      AND 'admin' = ANY (allowed)
    );
$$;

CREATE OR REPLACE FUNCTION public.app_can_manage_users()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.app_role_in(ARRAY['super_admin', 'tenant_admin', 'admin']);
$$;

CREATE OR REPLACE FUNCTION public.app_is_platform_privilege_role(p_role_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(p_role_code, '') = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION public.app_is_tenant_assignable_role(p_role_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(p_role_code, 'staff') = ANY (ARRAY[
    'tenant_admin',
    'admin',
    'manager',
    'engineer',
    'sales',
    'accountant',
    'employee',
    'staff',
    'viewer'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.app_users_self_update_ok(
  p_role_code text,
  p_company_id uuid,
  p_is_platform_admin boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
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

CREATE OR REPLACE FUNCTION public.app_can_insert_user_row(
  p_company_id uuid,
  p_role_code text,
  p_is_platform_admin boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    CASE
      WHEN public.is_platform_admin() THEN true
      WHEN public.app_can_manage_users()
           AND p_company_id IS NOT DISTINCT FROM public.current_app_company_id()
           AND COALESCE(p_is_platform_admin, false) = false
           AND NOT public.app_is_platform_privilege_role(COALESCE(p_role_code, 'staff'))
           AND public.app_is_tenant_assignable_role(COALESCE(p_role_code, 'staff'))
        THEN true
      ELSE false
    END;
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
SET search_path = pg_catalog, public
AS $$
  SELECT
    CASE
      WHEN public.is_platform_admin() THEN true
      WHEN public.app_can_manage_users()
           AND p_new_company_id IS NOT DISTINCT FROM public.current_app_company_id()
           AND COALESCE(p_new_is_platform_admin, false) = false
           AND NOT public.app_is_platform_privilege_role(COALESCE(p_new_role_code, 'staff'))
           AND public.app_is_tenant_assignable_role(COALESCE(p_new_role_code, 'staff'))
           AND EXISTS (
             SELECT 1
             FROM public.users t
             WHERE t.id = p_target_id
               AND t.company_id = public.current_app_company_id()
               AND COALESCE(t.is_platform_admin, false) = false
               AND NOT public.app_is_platform_privilege_role(t.role_code)
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

-- Harden core helpers search_path
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (
      SELECT (u.is_platform_admin = true OR u.role_code = 'super_admin')
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.deleted_at IS NULL
        AND u.is_active = true
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.company_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.deleted_at IS NULL
    AND u.is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_app_role_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_role_in(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_manage_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_is_platform_privilege_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_is_tenant_assignable_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_users_self_update_ok(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_insert_user_row(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_update_user_row(uuid, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_company_id() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_app_role_code() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_role_in(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_manage_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_is_platform_privilege_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_is_tenant_assignable_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_users_self_update_ok(text, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_insert_user_row(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_update_user_row(uuid, text, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_company_id() TO authenticated, service_role;

-- ─── Replace weak INSERT/UPDATE policies ─────────────────────────────────
DO $$
DECLARE
  has_platform_col boolean;
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'users table missing';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'is_platform_admin'
  ) INTO has_platform_col;

  -- Drop weak tenant-only and prior admin policies (OR would keep the hole open)
  DROP POLICY IF EXISTS users_insert_tenant ON public.users;
  DROP POLICY IF EXISTS users_update_tenant ON public.users;
  DROP POLICY IF EXISTS users_insert_admin ON public.users;
  DROP POLICY IF EXISTS users_update_admin ON public.users;

  IF has_platform_col THEN
    CREATE POLICY users_insert_admin ON public.users
      FOR INSERT TO authenticated
      WITH CHECK (
        public.app_can_insert_user_row(
          company_id,
          role_code,
          COALESCE(is_platform_admin, false)
        )
      );

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
  ELSE
    -- No is_platform_admin column — gate on role_code only
    CREATE POLICY users_insert_admin ON public.users
      FOR INSERT TO authenticated
      WITH CHECK (
        public.app_can_insert_user_row(company_id, role_code, false)
      );

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
        public.app_can_update_user_row(id, role_code, company_id, false)
      );
  END IF;

  RAISE NOTICE 'users: privilege-escalation locks applied (insert/update)';
END $$;

-- Verify
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users'
ORDER BY policyname;
