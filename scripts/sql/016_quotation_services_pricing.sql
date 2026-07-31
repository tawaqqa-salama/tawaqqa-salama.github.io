-- نطاق خدمات عرض السعر + سعر المتر المربع في إعدادات الشركة
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS quotation_services jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS price_per_m2 numeric DEFAULT 0;
