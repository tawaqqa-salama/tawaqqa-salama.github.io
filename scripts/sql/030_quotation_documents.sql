-- Quotation prerequisite documents on clients
-- building_permit required in app before issuing quotation;
-- owner_id and commercial_register are optional.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS quotation_documents jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clients.quotation_documents IS
  'مستندات عرض السعر: رخصة البناء (إلزامي في التطبيق)، هوية المالك والسجل التجاري (اختياري)';
