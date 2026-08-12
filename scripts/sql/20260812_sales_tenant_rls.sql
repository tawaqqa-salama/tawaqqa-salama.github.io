-- ============================================================================
-- Tenant-safe RLS for sales tables (schema-aware)
-- Tables: sales_documents, sales_contracts, sales_returns
-- App often inserts client_id without company_id — prefer via-client path.
-- Prerequisites:
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Idempotent. Skips missing tables.
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'sales_documents',
    'sales_contracts',
    'sales_returns'
  ];
  has_company_id boolean;
  has_client_id boolean;
  r record;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '%: table missing — skipped', t;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) INTO has_company_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'client_id'
    ) INTO has_client_id;

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
          OR policyname = t || '_tenant_isolation'
          OR policyname = t || '_tenant_via_client'
          OR policyname LIKE '%_open%'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    IF has_client_id THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (
             public.is_platform_admin()
             OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             )
           )
           WITH CHECK (
             public.is_platform_admin()
             OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             )
           )',
        t || '_tenant_via_client', t, t, t
      );
      RAISE NOTICE '%: applied client_id → clients.company_id tenant isolation', t;

    ELSIF has_company_id THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )
           WITH CHECK (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_isolation', t
      );
      RAISE NOTICE '%: applied company_id tenant isolation', t;

    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (public.is_platform_admin())
           WITH CHECK (public.is_platform_admin())',
        t || '_tenant_isolation', t
      );
      RAISE NOTICE '%: no company_id/client_id — locked to platform admin only', t;
    END IF;
  END LOOP;
END $$;

-- Verify
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('sales_documents', 'sales_contracts', 'sales_returns')
ORDER BY tablename, policyname;
