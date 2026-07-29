-- DDS v1.0 — العملاء، المبيعات، المحاسبة (متوافق مع التطبيق الحالي + Multi-Tenant)

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  client_code text NOT NULL,
  name text NOT NULL,
  owner_name text,
  phone text,
  region text,
  city text,
  district text,
  street text,
  plot_number text,
  national_address text,
  business_name text,
  activity_type text,
  land_area numeric,
  building_area numeric,
  floors_count integer,
  project_status text,
  pipeline_stage text DEFAULT 'marketing',
  lead_status text DEFAULT 'مهتم',
  lead_notes text,
  next_follow_up_date date,
  last_contact_date date,
  quotation_number text,
  quotation_amount numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  quotation_status text DEFAULT 'مسودة',
  quotation_visits_count integer DEFAULT 1,
  financial_status text DEFAULT 'بانتظار الدفعة',
  payment_reference text,
  paid_amount numeric DEFAULT 0,
  sales_payment_type text DEFAULT 'نقدي',
  credit_balance numeric DEFAULT 0,
  assigned_engineer text,
  engineering_status text DEFAULT 'جديد',
  engineering_notes text,
  visit_date timestamptz,
  visit_status text DEFAULT 'لم تُجدول',
  inspection_checklist jsonb DEFAULT '[]'::jsonb,
  project_engineering_data jsonb DEFAULT '{}'::jsonb,
  final_report_status text DEFAULT 'قيد الإعداد',
  license_number text,
  license_expiry_date date,
  receipt_voucher_id uuid,
  accounting_journal_id uuid,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  archived_at timestamptz
);

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS plot_number text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS activity_type text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS land_area numeric;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS building_area numeric;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS floors_count integer;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS project_status text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS quotation_number text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS quotation_amount numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS quotation_status text DEFAULT 'مسودة';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS financial_status text DEFAULT 'بانتظار الدفعة';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS assigned_engineer text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS engineering_status text DEFAULT 'جديد';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS engineering_notes text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS visit_date timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS visit_status text DEFAULT 'لم تُجدول';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS inspection_checklist jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS final_report_status text DEFAULT 'قيد الإعداد';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS license_number text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS license_expiry_date date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'marketing';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS lead_status text DEFAULT 'مهتم';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS lead_notes text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS receipt_voucher_id uuid;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS accounting_journal_id uuid;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS next_follow_up_date date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_contact_date date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS quotation_visits_count integer DEFAULT 1;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS sales_payment_type text DEFAULT 'نقدي';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_balance numeric DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS project_engineering_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS national_address text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS version_no integer NOT NULL DEFAULT 1;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS public.client_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  follow_up_date date NOT NULL DEFAULT CURRENT_DATE,
  contact_method text,
  notes text,
  status text DEFAULT 'مجدول',
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.sales_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('quotation', 'invoice')),
  doc_number text NOT NULL,
  subtotal numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  status text DEFAULT 'مسودة',
  archived boolean DEFAULT false,
  notes text,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz,
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.sales_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  contract_number text NOT NULL UNIQUE,
  quotation_number text,
  contract_date date NOT NULL DEFAULT CURRENT_DATE,
  service_scope text,
  terms text,
  amount numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  status text DEFAULT 'مسودة',
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz,
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  return_number text NOT NULL UNIQUE,
  linked_doc_number text,
  amount numeric DEFAULT 0,
  reason text,
  status text DEFAULT 'مسودة',
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coa_company_code
  ON public.chart_of_accounts (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  department text,
  branch text,
  is_active boolean DEFAULT true,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_number text NOT NULL UNIQUE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  client_id text,
  reference_type text,
  reference_id text,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  status text DEFAULT 'مرحّل',
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz,
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  description text,
  debit numeric DEFAULT 0,
  credit numeric DEFAULT 0,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  voucher_number text NOT NULL UNIQUE,
  voucher_type text NOT NULL CHECK (voucher_type IN ('receipt', 'payment')),
  voucher_date date NOT NULL DEFAULT CURRENT_DATE,
  client_id text,
  amount numeric NOT NULL DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  reference_number text,
  description text,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  status text DEFAULT 'مرحّل',
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz,
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id text,
  voucher_id uuid REFERENCES public.vouchers(id) ON DELETE SET NULL,
  invoice_doc_id uuid REFERENCES public.sales_documents(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference_number text,
  notes text,
  status text DEFAULT 'مؤكد',
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_clients_company ON public.clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_pipeline ON public.clients(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_sales_docs_client ON public.sales_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_client ON public.vouchers(client_id);
CREATE INDEX IF NOT EXISTS idx_journal_client ON public.journal_entries(client_id);
