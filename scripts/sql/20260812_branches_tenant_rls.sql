-- ============================================================================
-- Tenant-safe RLS for public.branches only (041 pattern)
-- Prerequisites verified in production:
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Idempotent. Does not touch any other table/policy.
-- ============================================================================

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.branches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;

DROP POLICY IF EXISTS "Allow public read branches" ON public.branches;
DROP POLICY IF EXISTS "Allow public insert branches" ON public.branches;
DROP POLICY IF EXISTS "Allow public update branches" ON public.branches;
DROP POLICY IF EXISTS "Allow public delete branches" ON public.branches;
DROP POLICY IF EXISTS branches_tenant_isolation ON public.branches;

CREATE POLICY branches_tenant_isolation ON public.branches
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
