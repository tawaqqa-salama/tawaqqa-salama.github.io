-- ============================================================================
-- Tenant-safe RLS for public.roles only (041 pattern)
-- Prerequisites (verified in production):
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Idempotent. Does not touch any other table/policy.
-- ============================================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.roles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;

DROP POLICY IF EXISTS "Allow public read roles" ON public.roles;
DROP POLICY IF EXISTS "Allow public insert roles" ON public.roles;
DROP POLICY IF EXISTS "Allow public update roles" ON public.roles;
DROP POLICY IF EXISTS "Allow public delete roles" ON public.roles;
DROP POLICY IF EXISTS roles_all ON public.roles;
DROP POLICY IF EXISTS roles_tenant_isolation ON public.roles;

CREATE POLICY roles_tenant_isolation ON public.roles
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  );
