-- Accounting tenant scope hardening
-- Safe, idempotent migration for chart_of_accounts and cost_centers.
-- Does not delete rows or change existing account codes.

BEGIN;

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS company_id uuid;

ALTER TABLE public.cost_centers
  ADD COLUMN IF NOT EXISTS company_id uuid;

DO $$
DECLARE
  target_company_id uuid;
  company_count integer;
  null_accounts integer;
  null_cost_centers integer;
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

  -- Existing rows were created before tenant columns existed. Backfill only
  -- unassigned rows and fail closed if any row remains unresolved.
  UPDATE public.chart_of_accounts
  SET company_id = target_company_id
  WHERE company_id IS NULL;

  UPDATE public.cost_centers
  SET company_id = target_company_id
  WHERE company_id IS NULL;

  SELECT count(*)::integer INTO null_accounts
  FROM public.chart_of_accounts
  WHERE company_id IS NULL;

  SELECT count(*)::integer INTO null_cost_centers
  FROM public.cost_centers
  WHERE company_id IS NULL;

  IF null_accounts <> 0 OR null_cost_centers <> 0 THEN
    RAISE EXCEPTION
      'Accounting tenant backfill left unresolved rows: chart_of_accounts=%, cost_centers=%',
      null_accounts, null_cost_centers;
  END IF;
END $$;

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
END $$;

ALTER TABLE public.chart_of_accounts
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.cost_centers
  ALTER COLUMN company_id SET NOT NULL;

-- Account codes and cost-center codes are tenant-local identifiers.
-- The existing chart unique index already uses company_id; add the equivalent
-- tenant-local uniqueness for cost centers after the fail-closed backfill.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_centers_company_code
  ON public.cost_centers (company_id, code)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.tg_stamp_accounting_company_id()
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

REVOKE ALL ON FUNCTION public.tg_stamp_accounting_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_stamp_accounting_company_id() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_stamp_accounting_company_id ON public.chart_of_accounts;
CREATE TRIGGER trg_stamp_accounting_company_id
  BEFORE INSERT OR UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE PROCEDURE public.tg_stamp_accounting_company_id();

DROP TRIGGER IF EXISTS trg_stamp_accounting_company_id ON public.cost_centers;
CREATE TRIGGER trg_stamp_accounting_company_id
  BEFORE INSERT OR UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE PROCEDURE public.tg_stamp_accounting_company_id();

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chart_of_accounts FROM anon;
REVOKE ALL ON public.cost_centers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.chart_of_accounts TO service_role;
GRANT ALL ON public.cost_centers TO service_role;

DROP POLICY IF EXISTS chart_of_accounts_tenant_isolation ON public.chart_of_accounts;
DROP POLICY IF EXISTS cost_centers_tenant_isolation ON public.cost_centers;
DROP POLICY IF EXISTS chart_of_accounts_all_auth ON public.chart_of_accounts;
DROP POLICY IF EXISTS cost_centers_all_auth ON public.cost_centers;
DROP POLICY IF EXISTS chart_of_accounts_all_anon ON public.chart_of_accounts;
DROP POLICY IF EXISTS cost_centers_all_anon ON public.cost_centers;

CREATE POLICY chart_of_accounts_tenant_isolation
  ON public.chart_of_accounts
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  );

CREATE POLICY cost_centers_tenant_isolation
  ON public.cost_centers
  FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  );

COMMIT;
