-- Accounting tenant scope hardening
-- Atomic, idempotent migration for the accounting integrity chain.
-- Production application is intentionally separate from this repository change.

BEGIN;

-- 1) Add nullable tenant columns before any backfill.
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS company_id uuid;

ALTER TABLE public.cost_centers
  ADD COLUMN IF NOT EXISTS company_id uuid;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS company_id uuid;

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- 2) Resolve every existing row through authoritative relationships.
DO $$
DECLARE
  target_company_id uuid;
  company_count integer;
  unresolved_accounts integer;
  unresolved_cost_centers integer;
  unresolved_journals integer;
  unresolved_vouchers integer;
BEGIN
  SELECT count(*)::integer, min(id)
    INTO company_count, target_company_id
  FROM public.companies
  WHERE code = 'TWAQQA';

  IF company_count <> 1 OR target_company_id IS NULL THEN
    RAISE EXCEPTION
      'Accounting tenant backfill requires exactly one company with code TWAQQA; found %',
      company_count;
  END IF;

  UPDATE public.chart_of_accounts
  SET company_id = target_company_id
  WHERE company_id IS NULL;

  UPDATE public.cost_centers
  SET company_id = target_company_id
  WHERE company_id IS NULL;

  UPDATE public.journal_entries je
  SET company_id = c.company_id
  FROM public.clients c
  WHERE je.company_id IS NULL
    AND je.client_id IS NOT NULL
    AND c.id::text = je.client_id::text;

  UPDATE public.vouchers v
  SET company_id = c.company_id
  FROM public.clients c
  WHERE v.company_id IS NULL
    AND v.client_id IS NOT NULL
    AND c.id::text = v.client_id::text;

  SELECT count(*)::integer INTO unresolved_accounts
  FROM public.chart_of_accounts WHERE company_id IS NULL;

  SELECT count(*)::integer INTO unresolved_cost_centers
  FROM public.cost_centers WHERE company_id IS NULL;

  SELECT count(*)::integer INTO unresolved_journals
  FROM public.journal_entries je
  WHERE je.company_id IS NULL
     OR je.client_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.clients c
       WHERE c.id::text = je.client_id::text
         AND c.company_id = je.company_id
     );

  SELECT count(*)::integer INTO unresolved_vouchers
  FROM public.vouchers v
  WHERE v.company_id IS NULL
     OR v.client_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.clients c
       WHERE c.id::text = v.client_id::text
         AND c.company_id = v.company_id
     );

  IF unresolved_accounts <> 0
     OR unresolved_cost_centers <> 0
     OR unresolved_journals <> 0
     OR unresolved_vouchers <> 0 THEN
    RAISE EXCEPTION
      'Accounting tenant backfill unresolved rows: accounts=%, cost_centers=%, journals=%, vouchers=%',
      unresolved_accounts, unresolved_cost_centers, unresolved_journals, unresolved_vouchers;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries je
    JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN public.chart_of_accounts a ON a.id = jel.account_id
    WHERE a.company_id <> je.company_id
  ) THEN
    RAISE EXCEPTION 'Existing journal line references an account from another company';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.cost_center_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.cost_centers cc
        WHERE cc.id = je.cost_center_id
          AND cc.company_id = je.company_id
      )
  ) THEN
    RAISE EXCEPTION 'Existing journal entry references a cost center from another company';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.cost_centers cc ON cc.id = jel.cost_center_id
    WHERE jel.cost_center_id IS NOT NULL
      AND cc.company_id <> je.company_id
  ) THEN
    RAISE EXCEPTION 'Existing journal line references a cost center from another company';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vouchers v
    JOIN public.cost_centers cc ON cc.id = v.cost_center_id
    WHERE v.cost_center_id IS NOT NULL
      AND cc.company_id <> v.company_id
  ) THEN
    RAISE EXCEPTION 'Existing voucher references a cost center from another company';
  END IF;
END $$;

-- 3) Drop old global code constraints only after successful backfill.
ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_code_key;

ALTER TABLE public.cost_centers
  DROP CONSTRAINT IF EXISTS cost_centers_code_key;

DROP INDEX IF EXISTS public.uq_coa_company_code;
DROP INDEX IF EXISTS public.uq_cost_centers_company_code;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chart_of_accounts_company_code_key'
      AND conrelid = 'public.chart_of_accounts'::regclass
  ) THEN
    ALTER TABLE public.chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_company_code_key UNIQUE (company_id, code);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cost_centers_company_code_key'
      AND conrelid = 'public.cost_centers'::regclass
  ) THEN
    ALTER TABLE public.cost_centers
      ADD CONSTRAINT cost_centers_company_code_key UNIQUE (company_id, code);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chart_of_accounts_id_company_key'
      AND conrelid = 'public.chart_of_accounts'::regclass
  ) THEN
    ALTER TABLE public.chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_id_company_key UNIQUE (id, company_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cost_centers_id_company_key'
      AND conrelid = 'public.cost_centers'::regclass
  ) THEN
    ALTER TABLE public.cost_centers
      ADD CONSTRAINT cost_centers_id_company_key UNIQUE (id, company_id);
  END IF;
END $$;

ALTER TABLE public.chart_of_accounts
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.cost_centers
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.journal_entries
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.vouchers
  ALTER COLUMN company_id SET NOT NULL;

-- 4) Foreign keys for tenant ownership.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chart_of_accounts_company_fk'
      AND conrelid = 'public.chart_of_accounts'::regclass
  ) THEN
    ALTER TABLE public.chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_company_fk
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cost_centers_company_fk'
      AND conrelid = 'public.cost_centers'::regclass
  ) THEN
    ALTER TABLE public.cost_centers
      ADD CONSTRAINT cost_centers_company_fk
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'journal_entries_company_fk'
      AND conrelid = 'public.journal_entries'::regclass
  ) THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_company_fk
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vouchers_company_fk'
      AND conrelid = 'public.vouchers'::regclass
  ) THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT vouchers_company_fk
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Replace cost-center FKs with composite FKs so document headers cannot point
-- to a cost center owned by another tenant.
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_cost_center_id_fkey;
ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_cost_center_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'journal_entries_cost_center_company_fk'
      AND conrelid = 'public.journal_entries'::regclass
  ) THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_cost_center_company_fk
      FOREIGN KEY (cost_center_id, company_id)
      REFERENCES public.cost_centers (id, company_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vouchers_cost_center_company_fk'
      AND conrelid = 'public.vouchers'::regclass
  ) THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT vouchers_cost_center_company_fk
      FOREIGN KEY (cost_center_id, company_id)
      REFERENCES public.cost_centers (id, company_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 5) Stamp document ownership and prevent tenant reassignment.
CREATE OR REPLACE FUNCTION public.tg_stamp_accounting_document_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.company_id IS NOT NULL
     AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Accounting document company_id cannot be changed';
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_app_company_id();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_stamp_accounting_document_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_stamp_accounting_document_company_id() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_stamp_accounting_document_company_id ON public.journal_entries;
CREATE TRIGGER trg_stamp_accounting_document_company_id
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE PROCEDURE public.tg_stamp_accounting_document_company_id();

DROP TRIGGER IF EXISTS trg_stamp_accounting_document_company_id ON public.vouchers;
CREATE TRIGGER trg_stamp_accounting_document_company_id
  BEFORE INSERT OR UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE PROCEDURE public.tg_stamp_accounting_document_company_id();

CREATE OR REPLACE FUNCTION public.tg_stamp_accounting_master_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.company_id IS NOT NULL
     AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Accounting master company_id cannot be changed';
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_app_company_id();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_stamp_accounting_master_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_stamp_accounting_master_company_id() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_stamp_accounting_master_company_id ON public.chart_of_accounts;
CREATE TRIGGER trg_stamp_accounting_master_company_id
  BEFORE INSERT OR UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE PROCEDURE public.tg_stamp_accounting_master_company_id();

DROP TRIGGER IF EXISTS trg_stamp_accounting_master_company_id ON public.cost_centers;
CREATE TRIGGER trg_stamp_accounting_master_company_id
  BEFORE INSERT OR UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE PROCEDURE public.tg_stamp_accounting_master_company_id();

-- 6) Journal lines deliberately keep no redundant company_id. A database trigger
-- enforces journal ownership, account ownership, and cost-center ownership.
CREATE OR REPLACE FUNCTION public.assert_accounting_line_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  journal_company uuid;
  account_company uuid;
  cost_center_company uuid;
BEGIN
  SELECT company_id INTO journal_company
  FROM public.journal_entries
  WHERE id = NEW.journal_entry_id;

  SELECT company_id INTO account_company
  FROM public.chart_of_accounts
  WHERE id = NEW.account_id;

  IF journal_company IS NULL OR account_company IS NULL OR journal_company <> account_company THEN
    RAISE EXCEPTION 'Journal line account must belong to the journal company';
  END IF;

  IF NEW.cost_center_id IS NOT NULL THEN
    SELECT company_id INTO cost_center_company
    FROM public.cost_centers
    WHERE id = NEW.cost_center_id;
    IF cost_center_company IS NULL OR cost_center_company <> journal_company THEN
      RAISE EXCEPTION 'Journal line cost center must belong to the journal company';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_accounting_line_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_accounting_line_tenant() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_assert_accounting_line_tenant ON public.journal_entry_lines;
CREATE TRIGGER trg_assert_accounting_line_tenant
  BEFORE INSERT OR UPDATE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE PROCEDURE public.assert_accounting_line_tenant();

-- 7) Replace legacy accounting policies with one explicit policy per table.
DO $$
DECLARE
  table_name text;
  policy_row record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'chart_of_accounts', 'cost_centers', 'journal_entries',
    'journal_entry_lines', 'vouchers'
  ] LOOP
    FOR policy_row IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, table_name);
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chart_of_accounts FROM anon;
REVOKE ALL ON public.cost_centers FROM anon;
REVOKE ALL ON public.journal_entries FROM anon;
REVOKE ALL ON public.journal_entry_lines FROM anon;
REVOKE ALL ON public.vouchers FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entry_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;

GRANT ALL ON public.chart_of_accounts TO service_role;
GRANT ALL ON public.cost_centers TO service_role;
GRANT ALL ON public.journal_entries TO service_role;
GRANT ALL ON public.journal_entry_lines TO service_role;
GRANT ALL ON public.vouchers TO service_role;

CREATE POLICY chart_of_accounts_tenant_isolation
  ON public.chart_of_accounts FOR ALL TO authenticated
  USING (public.is_platform_admin() OR company_id = public.current_app_company_id())
  WITH CHECK (public.is_platform_admin() OR company_id = public.current_app_company_id());

CREATE POLICY cost_centers_tenant_isolation
  ON public.cost_centers FOR ALL TO authenticated
  USING (public.is_platform_admin() OR company_id = public.current_app_company_id())
  WITH CHECK (public.is_platform_admin() OR company_id = public.current_app_company_id());

CREATE POLICY journal_entries_tenant_isolation
  ON public.journal_entries FOR ALL TO authenticated
  USING (public.is_platform_admin() OR company_id = public.current_app_company_id())
  WITH CHECK (public.is_platform_admin() OR company_id = public.current_app_company_id());

CREATE POLICY journal_entry_lines_tenant_isolation
  ON public.journal_entry_lines FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_lines.journal_entry_id
        AND je.company_id = public.current_app_company_id()
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_lines.journal_entry_id
        AND je.company_id = public.current_app_company_id()
    )
  );

CREATE POLICY vouchers_tenant_isolation
  ON public.vouchers FOR ALL TO authenticated
  USING (public.is_platform_admin() OR company_id = public.current_app_company_id())
  WITH CHECK (public.is_platform_admin() OR company_id = public.current_app_company_id());

COMMIT;
