-- ============================================================================
-- Tenant-safe RLS for public.projects only (schema-aware)
-- Production may lack company_id (pre-003 legacy table).
-- Prerequisites:
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Idempotent. Does not touch any other table/policy.
-- ============================================================================

DO $$
DECLARE
  has_company_id boolean;
  has_client_id boolean;
  r record;
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE NOTICE 'projects: table missing — skipped';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'company_id'
  ) INTO has_company_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'client_id'
  ) INTO has_client_id;

  ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.projects FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
  GRANT ALL ON public.projects TO service_role;

  -- Drop known open policies
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

  IF has_company_id THEN
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
    RAISE NOTICE 'projects: applied company_id tenant isolation';

  ELSIF has_client_id THEN
    -- Legacy: scope through clients.company_id when client_id stores clients.id as text/uuid
    CREATE POLICY projects_tenant_via_client ON public.projects
      FOR ALL
      TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id::text = projects.client_id::text
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id::text = projects.client_id::text
            AND c.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'projects: applied client_id → clients.company_id tenant isolation';

  ELSE
    -- No tenant key: deny authenticated DML until schema is fixed; keep service_role
    CREATE POLICY projects_tenant_isolation ON public.projects
      FOR ALL
      TO authenticated
      USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin());
    RAISE NOTICE 'projects: no company_id/client_id — authenticated locked to platform admin only';
  END IF;
END $$;
