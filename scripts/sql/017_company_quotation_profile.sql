-- حقول معلومات الشركة لعروض الأسعار والفواتير
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS commercial_register text,
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS price_per_m2 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS payment_first text,
  ADD COLUMN IF NOT EXISTS payment_second text,
  ADD COLUMN IF NOT EXISTS payment_final text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS stamp_url text,
  ADD COLUMN IF NOT EXISTS stamp_text text,
  ADD COLUMN IF NOT EXISTS quotation_validity_days integer DEFAULT 14;
