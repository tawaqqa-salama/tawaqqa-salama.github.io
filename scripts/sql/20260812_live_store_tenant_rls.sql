-- ============================================================================
-- Tenant-safe RLS for live-store tables (via clients.company_id)
-- Tables:
--   project_engineering_live
--   project_stage4_live
--   project_supervision_reports
--   field_visit_reports
--   report_pdf_snapshots
-- Prerequisites:
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Idempotent. Skips missing tables. Does not touch other tables.
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'project_engineering_live',
    'project_stage4_live',
    'project_supervision_reports',
    'field_visit_reports',
    'report_pdf_snapshots'
  ];
  has_client_id boolean;
  r record;
  pol text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '%: table missing — skipped', t;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'client_id'
    ) INTO has_client_id;

    IF NOT has_client_id THEN
      RAISE NOTICE '%: no client_id — skipped', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      t
    );
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND (
          policyname LIKE 'Allow public %'
          OR policyname = t || '_all'
          OR policyname = t || '_tenant'
          OR policyname LIKE '%_open%'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    pol := t || '_tenant';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR ALL TO authenticated
         USING (
           public.is_platform_admin()
           OR EXISTS (
             SELECT 1 FROM public.clients c
             WHERE c.id = %I.client_id
               AND c.company_id = public.current_app_company_id()
           )
         )
         WITH CHECK (
           public.is_platform_admin()
           OR EXISTS (
             SELECT 1 FROM public.clients c
             WHERE c.id = %I.client_id
               AND c.company_id = public.current_app_company_id()
           )
         )',
      pol, t, t, t
    );

    RAISE NOTICE '%: applied client_id → clients.company_id tenant isolation', t;
  END LOOP;
END $$;

-- Verify
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'project_engineering_live',
    'project_stage4_live',
    'project_supervision_reports',
    'field_visit_reports',
    'report_pdf_snapshots'
  )
ORDER BY tablename, policyname;
