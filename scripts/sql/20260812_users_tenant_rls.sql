-- ============================================================================
-- Tenant-safe RLS for public.users only (041 pattern)
-- Closes open "Allow public %" policies.
-- Prerequisites (verified in production):
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Also ensures public.current_app_user_id() (needed by SELECT policy).
--
-- Note: Full privilege-escalation locks (042–044 helpers / role promotion
-- guards) are NOT included here. Apply 042–044 later for that layer.
-- Idempotent. Does not touch any other table/policy.
-- ============================================================================

-- Helper used by SELECT (self row) — users.company_id schema only
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_user_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.users FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

DROP POLICY IF EXISTS "Allow public read users" ON public.users;
DROP POLICY IF EXISTS "Allow public insert users" ON public.users;
DROP POLICY IF EXISTS "Allow public update users" ON public.users;
DROP POLICY IF EXISTS "Allow public delete users" ON public.users;
DROP POLICY IF EXISTS users_tenant_isolation ON public.users;
DROP POLICY IF EXISTS users_tenant_all ON public.users;
DROP POLICY IF EXISTS users_select_tenant ON public.users;
DROP POLICY IF EXISTS users_insert_tenant ON public.users;
DROP POLICY IF EXISTS users_update_tenant ON public.users;
DROP POLICY IF EXISTS users_delete_tenant ON public.users;
DROP POLICY IF EXISTS users_select_scoped ON public.users;
DROP POLICY IF EXISTS users_insert_admin ON public.users;
DROP POLICY IF EXISTS users_update_admin ON public.users;
DROP POLICY IF EXISTS users_delete_admin ON public.users;

CREATE POLICY users_select_tenant ON public.users
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
    OR id = public.current_app_user_id()
  );

CREATE POLICY users_insert_tenant ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  );

CREATE POLICY users_update_tenant ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  );

CREATE POLICY users_delete_tenant ON public.users
  FOR DELETE
  TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  );
