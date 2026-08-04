-- مستندات عرض السعر على العملاء (رخصة البناء إلزامية في التطبيق)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS quotation_documents jsonb NOT NULL DEFAULT '{}'::jsonb;
