-- ============================================================================
-- Tenant-safe RLS for public.projects (production legacy schema)
-- Confirmed columns: id, created_at, project_code, client_id, name, type,
--   city, status, expiry_date  — NO company_id
-- Isolates via: projects.client_id → clients.id → clients.company_id
-- Prerequisites:
--   public.current_app_company_id()
--   public.is_platform_admin()
--   public.clients already tenant-locked (recommended)
-- Idempotent. Does not touch any other table/policy.
-- ============================================================================

DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE EXCEPTION 'projects: table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'client_id'
  ) THEN
    RAISE EXCEPTION 'projects: expected column client_id is missing';
  END IF;

  ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.projects FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
  GRANT ALL ON public.projects TO service_role;

  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects'
      AND (
        policyname LIKE 'Allow public %'
        OR policyname IN (
          'projects_all',
          'projects_tenant_isolation',
          'projects_tenant_via_client'
        )
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.projects', r.policyname);
  END LOOP;

  CREATE POLICY projects_tenant_via_client ON public.projects
    FOR ALL
    TO authenticated
    USING (
      public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = projects.client_id
          AND c.company_id = public.current_app_company_id()
      )
    )
    WITH CHECK (
      public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = projects.client_id
          AND c.company_id = public.current_app_company_id()
      )
    );

  RAISE NOTICE 'projects: applied client_id → clients.company_id tenant isolation';
END $$;

-- Verify
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'projects'
ORDER BY policyname;
