-- P0: Replace open RLS (USING true / anon ALL) with tenant-scoped policies.
-- Requires users.auth_user_id linked to auth.users for authenticated JWT.

CREATE OR REPLACE FUNCTION public.current_app_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.company_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.deleted_at IS NULL
    AND u.is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_app_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_company_id() TO authenticated;

-- Sensitive tables that have company_id
DO $$
DECLARE
  r record;
  sensitive text[] := ARRAY[
    'journal_entries','vouchers','payments',
    'chart_of_accounts','cost_centers',
    'sales_documents','sales_contracts','sales_returns',
    'zatca_invoices','zatca_retry_queue',
    'acc_fiscal_years','acc_fiscal_periods','acc_accounting_rules',
    'acc_ar_invoices','acc_ap_bills','acc_bank_accounts','acc_bank_transactions',
    'acc_fixed_assets','acc_budgets','acc_project_ledgers','acc_audit_findings',
    'clients','client_follow_ups',
    'activity_logs'
  ];
  t text;
  has_company boolean;
BEGIN
  FOREACH t IN ARRAY sensitive LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) INTO has_company;

    IF NOT has_company THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    FOR r IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (company_id IS NULL OR company_id = public.current_app_company_id())
         WITH CHECK (company_id IS NULL OR company_id = public.current_app_company_id())',
      t || '_tenant_all',
      t
    );
  END LOOP;
END $$;

-- journal_entry_lines: no company_id — scope via parent journal
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.journal_entry_lines') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.journal_entry_lines FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entry_lines TO authenticated;

  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_entry_lines'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.journal_entry_lines', r.policyname);
  END LOOP;

  CREATE POLICY journal_entry_lines_tenant_all ON public.journal_entry_lines
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.id = journal_entry_id
          AND (je.company_id IS NULL OR je.company_id = public.current_app_company_id())
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.id = journal_entry_id
          AND (je.company_id IS NULL OR je.company_id = public.current_app_company_id())
      )
    );
END $$;

-- activity_logs: no company_id — scope via acting user
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.activity_logs') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.activity_logs FROM anon;
  GRANT SELECT, INSERT ON public.activity_logs TO authenticated;

  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_logs', r.policyname);
  END LOOP;

  CREATE POLICY activity_logs_tenant_all ON public.activity_logs
    FOR ALL TO authenticated
    USING (
      user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = activity_logs.user_id
          AND u.company_id = public.current_app_company_id()
      )
    )
    WITH CHECK (
      user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = activity_logs.user_id
          AND u.company_id = public.current_app_company_id()
      )
    );
END $$;

-- Tighten storage anon policies from 028 (authenticated only)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "project_files_anon_select" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "project_files_anon_insert" ON storage.objects';
END $$;
