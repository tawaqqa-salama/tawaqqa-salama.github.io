-- Add the stable Supabase user reference used by the real engineer assignment UI.
-- Idempotent because the migration may be replayed against an already-correct database.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS assigned_engineer_id uuid
  REFERENCES public.users(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_assigned_engineer_id
  ON public.clients(assigned_engineer_id);
