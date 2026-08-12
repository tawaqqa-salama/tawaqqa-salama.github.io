-- ============================================================================
-- Tenant-safe RLS for enterprise accounting + payment milestones
-- acc_* tables: company_id + stamp
-- payment_milestones: via clients.company_id
-- journal_entry_lines: via journal_entries
-- Prerequisites:
--   public.current_app_company_id()
--   public.is_platform_admin()
--   public.tg_stamp_company_id()
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
    'acc_fiscal_years',
    'acc_fiscal_periods',
    'acc_accounting_rules',
    'acc_ar_invoices',
    'acc_ap_bills',
    'acc_bank_accounts',
    'acc_bank_transactions',
    'acc_fixed_assets',
    'acc_budgets',
    'acc_project_ledgers',
    'acc_audit_findings'
  ];
  has_company_id boolean;
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

    IF NOT has_company_id THEN
      RAISE NOTICE '%: no company_id — skipped', t;
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
          OR policyname = t || '_tenant_isolation'
          OR policyname LIKE '%_open%'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_company_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_stamp_company_id
         BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW
         EXECUTE PROCEDURE public.tg_stamp_company_id()',
      t
    );

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
  END LOOP;
END $$;

DO $$
DECLARE
  je_has_company_id boolean := false;
  je_has_client_id boolean := false;
BEGIN
  -- payment_milestones → clients
  IF to_regclass('public.payment_milestones') IS NOT NULL THEN
    ALTER TABLE public.payment_milestones ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.payment_milestones FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_milestones TO authenticated;
    GRANT ALL ON public.payment_milestones TO service_role;
    DROP POLICY IF EXISTS payment_milestones_all ON public.payment_milestones;
    DROP POLICY IF EXISTS payment_milestones_tenant ON public.payment_milestones;
    DROP POLICY IF EXISTS payment_milestones_tenant_isolation ON public.payment_milestones;
    CREATE POLICY payment_milestones_tenant ON public.payment_milestones
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = payment_milestones.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = payment_milestones.client_id
            AND c.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'payment_milestones: via clients.company_id';
  ELSE
    RAISE NOTICE 'payment_milestones: table missing — skipped';
  END IF;

  -- journal_entry_lines → journal_entries (schema-aware; prod may lack company_id)
  IF to_regclass('public.journal_entry_lines') IS NULL THEN
    RAISE NOTICE 'journal_entry_lines: table missing — skipped';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'company_id'
  ) INTO je_has_company_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'client_id'
  ) INTO je_has_client_id;

  ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.journal_entry_lines FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entry_lines TO authenticated;
  GRANT ALL ON public.journal_entry_lines TO service_role;
  DROP POLICY IF EXISTS journal_entry_lines_all ON public.journal_entry_lines;
  DROP POLICY IF EXISTS journal_entry_lines_tenant ON public.journal_entry_lines;

  IF je_has_company_id AND je_has_client_id THEN
    CREATE POLICY journal_entry_lines_tenant ON public.journal_entry_lines
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.journal_entries j
          WHERE j.id = journal_entry_lines.journal_entry_id
            AND (
              j.company_id = public.current_app_company_id()
              OR EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id::text = j.client_id::text
                  AND c.company_id = public.current_app_company_id()
              )
            )
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.journal_entries j
          WHERE j.id = journal_entry_lines.journal_entry_id
            AND (
              j.company_id = public.current_app_company_id()
              OR EXISTS (
                SELECT 1 FROM public.clients c
                WHERE c.id::text = j.client_id::text
                  AND c.company_id = public.current_app_company_id()
              )
            )
        )
      );
    RAISE NOTICE 'journal_entry_lines: via journal company_id OR client_id';

  ELSIF je_has_client_id THEN
    CREATE POLICY journal_entry_lines_tenant ON public.journal_entry_lines
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.journal_entries j
          JOIN public.clients c ON c.id::text = j.client_id::text
          WHERE j.id = journal_entry_lines.journal_entry_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.journal_entries j
          JOIN public.clients c ON c.id::text = j.client_id::text
          WHERE j.id = journal_entry_lines.journal_entry_id
            AND c.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'journal_entry_lines: via journal client_id → clients.company_id';

  ELSIF je_has_company_id THEN
    CREATE POLICY journal_entry_lines_tenant ON public.journal_entry_lines
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.journal_entries j
          WHERE j.id = journal_entry_lines.journal_entry_id
            AND j.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.journal_entries j
          WHERE j.id = journal_entry_lines.journal_entry_id
            AND j.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'journal_entry_lines: via journal company_id';

  ELSE
    CREATE POLICY journal_entry_lines_tenant ON public.journal_entry_lines
      FOR ALL TO authenticated
      USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin());
    RAISE NOTICE 'journal_entry_lines: no tenant key on journal_entries — platform admin only';
  END IF;
END $$;

-- Verify
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    tablename LIKE 'acc_%'
    OR tablename IN ('payment_milestones', 'journal_entry_lines')
  )
ORDER BY tablename, policyname;
