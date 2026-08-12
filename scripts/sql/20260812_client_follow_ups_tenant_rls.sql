-- ============================================================================
-- Tenant-safe RLS for public.client_follow_ups only (schema-aware)
-- App inserts set client_id only (no company_id) — prefer via-client path.
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
  IF to_regclass('public.client_follow_ups') IS NULL THEN
    RAISE NOTICE 'client_follow_ups: table missing — skipped';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_follow_ups'
      AND column_name = 'company_id'
  ) INTO has_company_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_follow_ups'
      AND column_name = 'client_id'
  ) INTO has_client_id;

  ALTER TABLE public.client_follow_ups ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.client_follow_ups FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_follow_ups TO authenticated;
  GRANT ALL ON public.client_follow_ups TO service_role;

  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_follow_ups'
      AND (
        policyname LIKE 'Allow public %'
        OR policyname IN (
          'client_follow_ups_all',
          'client_follow_ups_tenant_isolation',
          'client_follow_ups_tenant_via_client'
        )
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.client_follow_ups', r.policyname);
  END LOOP;

  -- Prefer client_id path: marketing UI inserts without company_id
  IF has_client_id THEN
    CREATE POLICY client_follow_ups_tenant_via_client ON public.client_follow_ups
      FOR ALL
      TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id::text = client_follow_ups.client_id::text
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id::text = client_follow_ups.client_id::text
            AND c.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'client_follow_ups: applied client_id → clients.company_id tenant isolation';

  ELSIF has_company_id THEN
    CREATE POLICY client_follow_ups_tenant_isolation ON public.client_follow_ups
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
    RAISE NOTICE 'client_follow_ups: applied company_id tenant isolation';

  ELSE
    CREATE POLICY client_follow_ups_tenant_isolation ON public.client_follow_ups
      FOR ALL
      TO authenticated
      USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin());
    RAISE NOTICE 'client_follow_ups: no company_id/client_id — authenticated locked to platform admin only';
  END IF;
END $$;

-- Verify
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'client_follow_ups'
ORDER BY policyname;
