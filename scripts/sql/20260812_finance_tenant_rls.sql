-- ============================================================================
-- Tenant-safe RLS for core finance tables (schema-aware)
-- Tables:
--   chart_of_accounts, cost_centers, journal_entries, vouchers, payments,
--   zatca_invoices, zatca_retry_queue
-- App often omits company_id on insert — stamp trigger fills it from session.
-- Tables with client_id also allow via-client match (OR).
-- Prerequisites:
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Idempotent. Skips missing tables.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_stamp_company_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_app_company_id();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_stamp_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_stamp_company_id() TO authenticated, service_role;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'chart_of_accounts',
    'cost_centers',
    'journal_entries',
    'vouchers',
    'payments',
    'zatca_invoices',
    'zatca_retry_queue'
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

    IF has_company_id THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_company_id ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_stamp_company_id
           BEFORE INSERT OR UPDATE ON public.%I
           FOR EACH ROW
           EXECUTE PROCEDURE public.tg_stamp_company_id()',
        t
      );
    END IF;

    IF has_company_id AND has_client_id THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
             OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             )
           )
           WITH CHECK (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
             OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             )
           )',
        t || '_tenant_isolation', t, t, t
      );
      RAISE NOTICE '%: applied company_id OR via-client tenant isolation (+ stamp)', t;

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
      RAISE NOTICE '%: applied company_id tenant isolation (+ stamp)', t;

    ELSIF has_client_id THEN
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

    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (public.is_platform_admin())
           WITH CHECK (public.is_platform_admin())',
        t || '_tenant_isolation', t
      );
      RAISE NOTICE '%: no tenant key — locked to platform admin only', t;
    END IF;
  END LOOP;
END $$;

-- Verify
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'chart_of_accounts',
    'cost_centers',
    'journal_entries',
    'vouchers',
    'payments',
    'zatca_invoices',
    'zatca_retry_queue'
  )
ORDER BY tablename, policyname;
