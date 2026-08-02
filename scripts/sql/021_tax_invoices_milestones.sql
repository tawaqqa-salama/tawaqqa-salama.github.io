-- Tax invoices + payment milestones (ZATCA Phase 2 billing schedule)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS client_kind text DEFAULT 'consumer';

CREATE TABLE IF NOT EXISTS public.payment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.sales_contracts(id) ON DELETE SET NULL,
  title text NOT NULL,
  percentage numeric(6,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  is_invoiced boolean NOT NULL DEFAULT false,
  tax_invoice_id uuid,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_milestones_client ON public.payment_milestones (client_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_contract ON public.payment_milestones (contract_id);

ALTER TABLE public.zatca_invoices
  ADD COLUMN IF NOT EXISTS invoice_type text DEFAULT 'SIMPLIFIED',
  ADD COLUMN IF NOT EXISTS business_status text DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS milestone_id uuid,
  ADD COLUMN IF NOT EXISTS contract_id uuid,
  ADD COLUMN IF NOT EXISTS buyer_name text,
  ADD COLUMN IF NOT EXISTS buyer_cr text,
  ADD COLUMN IF NOT EXISTS buyer_vat text,
  ADD COLUMN IF NOT EXISTS line_items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS trigger_source text;

CREATE INDEX IF NOT EXISTS idx_zatca_invoices_business_status ON public.zatca_invoices (business_status);
CREATE INDEX IF NOT EXISTS idx_zatca_invoices_milestone ON public.zatca_invoices (milestone_id);

ALTER TABLE public.payment_milestones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_milestones' AND policyname = 'payment_milestones_all_auth'
  ) THEN
    CREATE POLICY payment_milestones_all_auth ON public.payment_milestones
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
