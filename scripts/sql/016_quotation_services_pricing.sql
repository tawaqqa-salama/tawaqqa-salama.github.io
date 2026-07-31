-- نطاق خدمات عرض السعر + حقول إعدادات الشركة (ترويسة + سعر المتر)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS quotation_services jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS commercial_register text,
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS price_per_m2 numeric DEFAULT 0;
