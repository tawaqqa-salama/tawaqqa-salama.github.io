-- Lead attribution columns on clients (required for marketing / WhatsApp create flows).
-- Safe to re-run. Fixes: Could not find the 'first_contact_at' column of 'clients'

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS first_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_profile_name text;

CREATE INDEX IF NOT EXISTS idx_clients_phone ON public.clients (phone);
CREATE INDEX IF NOT EXISTS idx_clients_lead_source ON public.clients (lead_source);

-- Refresh PostgREST schema cache so inserts stop failing after ALTER
NOTIFY pgrst, 'reload schema';
