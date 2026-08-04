-- quotation_documents: building permit required in app; owner ID / CR optional
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS quotation_documents jsonb NOT NULL DEFAULT '{}'::jsonb;
