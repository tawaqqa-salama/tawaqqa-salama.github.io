-- ============================================================================
-- Tenant-safe RLS for public.clients only (041 pattern)
-- Prerequisites (verified in production):
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Idempotent. Does not touch any other table/policy.
-- ============================================================================

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.clients FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

DROP POLICY IF EXISTS "Allow public read clients" ON public.clients;
DROP POLICY IF EXISTS "Allow public insert clients" ON public.clients;
DROP POLICY IF EXISTS "Allow public update clients" ON public.clients;
DROP POLICY IF EXISTS "Allow public delete clients" ON public.clients;
DROP POLICY IF EXISTS clients_all ON public.clients;
DROP POLICY IF EXISTS clients_tenant_all ON public.clients;
DROP POLICY IF EXISTS clients_tenant_isolation ON public.clients;

CREATE POLICY clients_tenant_isolation ON public.clients
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
