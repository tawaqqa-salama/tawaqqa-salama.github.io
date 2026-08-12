-- ============================================================================
-- Tenant-safe RLS for public.projects only (041 pattern)
-- Prerequisites (verified in production):
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Idempotent. Does not touch any other table/policy.
-- ============================================================================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.projects FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

DROP POLICY IF EXISTS "Allow public read projects" ON public.projects;
DROP POLICY IF EXISTS "Allow public insert projects" ON public.projects;
DROP POLICY IF EXISTS "Allow public update projects" ON public.projects;
DROP POLICY IF EXISTS "Allow public delete projects" ON public.projects;
DROP POLICY IF EXISTS projects_all ON public.projects;
DROP POLICY IF EXISTS projects_tenant_isolation ON public.projects;

CREATE POLICY projects_tenant_isolation ON public.projects
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
