-- ZATCA Phase 2 — إعدادات الربط + سجل الفواتير الإلكترونية
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS zatca_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zatca_environment text DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS zatca_invoice_kind text DEFAULT 'simplified',
  ADD COLUMN IF NOT EXISTS zatca_otp text,
  ADD COLUMN IF NOT EXISTS zatca_csid text,
  ADD COLUMN IF NOT EXISTS zatca_secret text,
  ADD COLUMN IF NOT EXISTS zatca_compliance_request_id text,
  ADD COLUMN IF NOT EXISTS zatca_private_key_pem text,
  ADD COLUMN IF NOT EXISTS zatca_csr_pem text,
  ADD COLUMN IF NOT EXISTS zatca_certificate_pem text,
  ADD COLUMN IF NOT EXISTS zatca_egss_serial text,
  ADD COLUMN IF NOT EXISTS zatca_solution_name text;

CREATE TABLE IF NOT EXISTS public.zatca_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  sales_document_id uuid,
  invoice_number text NOT NULL,
  uuid text NOT NULL,
  invoice_hash text NOT NULL,
  previous_invoice_hash text NOT NULL,
  qr_base64 text,
  xml text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  environment text NOT NULL DEFAULT 'sandbox',
  invoice_kind text NOT NULL DEFAULT 'simplified',
  zatca_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zatca_invoices_created_at ON public.zatca_invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zatca_invoices_uuid ON public.zatca_invoices (uuid);
CREATE INDEX IF NOT EXISTS idx_zatca_invoices_client ON public.zatca_invoices (client_id);

ALTER TABLE public.zatca_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'zatca_invoices' AND policyname = 'zatca_invoices_all_auth'
  ) THEN
    CREATE POLICY zatca_invoices_all_auth ON public.zatca_invoices
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
