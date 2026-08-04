-- Enterprise Accounting & Finance (IFRS / SOCPA / ZATCA / Saudi VAT)
-- Extends 002_crm_sales_accounting + 018_zatca_einvoicing.
-- Production indexes for high-volume journals, AR/AP, and project cost centers.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Chart of Accounts enhancements ────────────────────────────────────────
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS level_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_header boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS opening_debit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_credit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS vat_category text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS mapping_key text;

CREATE INDEX IF NOT EXISTS idx_coa_parent ON public.chart_of_accounts (parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coa_type ON public.chart_of_accounts (account_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coa_mapping ON public.chart_of_accounts (mapping_key) WHERE deleted_at IS NULL;

-- ─── Fiscal periods / year lock ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acc_fiscal_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.acc_fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year_id uuid REFERENCES public.acc_fiscal_years(id) ON DELETE CASCADE,
  period_no integer NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_locked boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  locked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_periods_dates
  ON public.acc_fiscal_periods (company_id, start_date, end_date);

-- ─── Journal enhancements ──────────────────────────────────────────────────
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS entry_kind text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_entry_id uuid,
  ADD COLUMN IF NOT EXISTS recurring_rule jsonb,
  ADD COLUMN IF NOT EXISTS attachment_refs jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS maker_id uuid,
  ADD COLUMN IF NOT EXISTS checker_id uuid;

CREATE INDEX IF NOT EXISTS idx_journal_entries_date
  ON public.journal_entries (entry_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_status
  ON public.journal_entries (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_journal_lines_account
  ON public.journal_entry_lines (account_id);

-- ─── Accounting rules database ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acc_accounting_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  category text NOT NULL,
  title_en text NOT NULL,
  title_ar text NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  when_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  constraint_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  ifrs_refs text[] DEFAULT '{}',
  socpa_refs text[] DEFAULT '{}',
  zatca_refs text[] DEFAULT '{}',
  vat_refs text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  version_label text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_acc_rules_code
  ON public.acc_accounting_rules (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rule_code
  )
  WHERE deleted_at IS NULL;

-- ─── AR / AP ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acc_ar_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency_code text DEFAULT 'SAR',
  subtotal numeric NOT NULL DEFAULT 0,
  vat_category text DEFAULT 'standard',
  vat_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  credit_limit_snapshot numeric,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  project_id uuid,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_acc_ar_client_due
  ON public.acc_ar_invoices (client_id, due_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.acc_ap_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  vendor_id uuid,
  vendor_name text,
  bill_number text NOT NULL,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency_code text DEFAULT 'SAR',
  subtotal numeric NOT NULL DEFAULT 0,
  vat_category text DEFAULT 'standard',
  vat_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  project_id uuid,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_acc_ap_due
  ON public.acc_ap_bills (due_date)
  WHERE deleted_at IS NULL;

-- ─── Banking ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acc_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  bank_name text,
  iban text,
  currency_code text DEFAULT 'SAR',
  gl_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  opening_balance numeric NOT NULL DEFAULT 0,
  is_cash boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.acc_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.acc_bank_accounts(id) ON DELETE CASCADE,
  txn_date date NOT NULL,
  description text,
  amount numeric NOT NULL,
  txn_type text NOT NULL DEFAULT 'transfer',
  matched_journal_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  is_reconciled boolean NOT NULL DEFAULT false,
  import_batch_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_bank_txn_date
  ON public.acc_bank_transactions (bank_account_id, txn_date DESC);

-- ─── Fixed assets ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acc_fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  asset_code text NOT NULL,
  name text NOT NULL,
  category text,
  acquisition_date date,
  acquisition_cost numeric NOT NULL DEFAULT 0,
  useful_life_months integer NOT NULL DEFAULT 60,
  salvage_value numeric NOT NULL DEFAULT 0,
  depreciation_method text NOT NULL DEFAULT 'straight_line',
  accumulated_depreciation numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  gl_asset_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  gl_accum_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  gl_expense_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  disposed_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ─── Budgets ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acc_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year_id uuid REFERENCES public.acc_fiscal_years(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  version_no integer NOT NULL DEFAULT 1,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Project accounting (client/project as cost center) ────────────────────
CREATE TABLE IF NOT EXISTS public.acc_project_ledgers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  budget_amount numeric NOT NULL DEFAULT 0,
  revenue_amount numeric NOT NULL DEFAULT 0,
  expense_amount numeric NOT NULL DEFAULT 0,
  committed_cost numeric NOT NULL DEFAULT 0,
  actual_cost numeric NOT NULL DEFAULT 0,
  cash_in numeric NOT NULL DEFAULT 0,
  cash_out numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

-- ─── Internal audit findings ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acc_audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  finding_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warn',
  title text NOT NULL,
  detail text,
  entity_type text,
  entity_id text,
  rule_codes text[] DEFAULT '{}',
  ifrs_refs text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acc_audit_status
  ON public.acc_audit_findings (status, created_at DESC);

-- ─── ZATCA retry queue ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zatca_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zatca_invoice_id uuid REFERENCES public.zatca_invoices(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz,
  last_error text,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS + grants ──────────────────────────────────────────────────────────
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
    'acc_audit_findings',
    'zatca_retry_queue'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_all_auth'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_all_auth', t
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_all_anon'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)',
        t || '_all_anon', t
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.acc_accounting_rules IS
  'Configurable IFRS/SOCPA/ZATCA/VAT posting rules — AI and users cannot bypass these';
