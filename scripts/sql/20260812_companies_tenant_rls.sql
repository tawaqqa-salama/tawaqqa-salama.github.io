-- ============================================================================
-- Tenant-safe RLS for public.companies only
-- Note: companies has no company_id column — tenant key is companies.id
-- Pattern aligned with 041 spirit:
--   is_platform_admin() OR id = current_app_company_id()
-- Prerequisites (verified in production):
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Idempotent. Does not touch any other table/policy.
-- ============================================================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.companies FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

DROP POLICY IF EXISTS "Allow public read companies" ON public.companies;
DROP POLICY IF EXISTS "Allow public insert companies" ON public.companies;
DROP POLICY IF EXISTS "Allow public update companies" ON public.companies;
DROP POLICY IF EXISTS "Allow public delete companies" ON public.companies;
DROP POLICY IF EXISTS companies_all ON public.companies;
DROP POLICY IF EXISTS companies_tenant_isolation ON public.companies;

CREATE POLICY companies_tenant_isolation ON public.companies
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_admin()
    OR id = public.current_app_company_id()
  )
  WITH CHECK (
    public.is_platform_admin()
    OR id = public.current_app_company_id()
  );
