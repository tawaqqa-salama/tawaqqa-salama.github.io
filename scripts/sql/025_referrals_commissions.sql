-- Referrals / affiliates + multi-project owners + commission ledger

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  category text NOT NULL DEFAULT 'مسوق',
  classification text NOT NULL DEFAULT 'خارجي',
  commission_type text NOT NULL DEFAULT 'percent',
  commission_value numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_phone_unique
  ON public.referrals (phone);

CREATE INDEX IF NOT EXISTS idx_referrals_name ON public.referrals (name);
CREATE INDEX IF NOT EXISTS idx_referrals_category ON public.referrals (category);

CREATE TABLE IF NOT EXISTS public.owner_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  national_id text,
  commercial_register text,
  tax_number text,
  client_kind text DEFAULT 'consumer',
  city text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_accounts_phone ON public.owner_accounts (phone);
CREATE INDEX IF NOT EXISTS idx_owner_accounts_name ON public.owner_accounts (name);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS owner_account_id uuid REFERENCES public.owner_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES public.referrals(id) ON DELETE SET NULL;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS project_name text;

CREATE INDEX IF NOT EXISTS idx_clients_owner_account ON public.clients (owner_account_id);
CREATE INDEX IF NOT EXISTS idx_clients_referrer ON public.clients (referrer_id);

CREATE TABLE IF NOT EXISTS public.commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_label text,
  basis_amount numeric(14,2) NOT NULL DEFAULT 0,
  commission_type text NOT NULL DEFAULT 'percent',
  commission_rate numeric(14,2) NOT NULL DEFAULT 0,
  earned_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'accrued',
  notes text,
  accrued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_entries_referral ON public.commission_entries (referral_id);
CREATE INDEX IF NOT EXISTS idx_commission_entries_client ON public.commission_entries (client_id);
CREATE INDEX IF NOT EXISTS idx_commission_entries_status ON public.commission_entries (status);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referrals' AND policyname = 'referrals_all_auth'
  ) THEN
    CREATE POLICY referrals_all_auth ON public.referrals FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'owner_accounts' AND policyname = 'owner_accounts_all_auth'
  ) THEN
    CREATE POLICY owner_accounts_all_auth ON public.owner_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'commission_entries' AND policyname = 'commission_entries_all_auth'
  ) THEN
    CREATE POLICY commission_entries_all_auth ON public.commission_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
