-- Procurement & vendor management (إدارة المشتريات والتعاقدات)

CREATE TABLE IF NOT EXISTS public.procurement_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vendor_type text NOT NULL DEFAULT 'supplier',
  specialty text,
  commercial_register text,
  tax_number text,
  phone text,
  email text,
  city text,
  address text,
  certification_notes text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL,
  vendor_id uuid REFERENCES public.procurement_vendors(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'equipment',
  status text NOT NULL DEFAULT 'draft',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  requested_at date,
  needed_by date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procurement_rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.procurement_vendors(id) ON DELETE SET NULL,
  source_boq boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_vendors_type ON public.procurement_vendors (vendor_type);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_procurement_rfqs_client ON public.procurement_rfqs (client_id);

ALTER TABLE public.procurement_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_rfqs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'procurement_vendors' AND policyname = 'procurement_vendors_all_auth'
  ) THEN
    CREATE POLICY procurement_vendors_all_auth ON public.procurement_vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'purchase_orders' AND policyname = 'purchase_orders_all_auth'
  ) THEN
    CREATE POLICY purchase_orders_all_auth ON public.purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'procurement_rfqs' AND policyname = 'procurement_rfqs_all_auth'
  ) THEN
    CREATE POLICY procurement_rfqs_all_auth ON public.procurement_rfqs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
