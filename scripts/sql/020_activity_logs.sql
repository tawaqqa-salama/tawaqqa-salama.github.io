-- سجل نشاطات المستخدمين (User Activity Log & Audit Trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_name text NOT NULL DEFAULT '',
  user_role text NOT NULL DEFAULT '',
  action_type text NOT NULL,
  page_url text,
  module text,
  details text NOT NULL DEFAULT '',
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_logs_action_type_check CHECK (
    action_type IN (
      'LOGIN',
      'LOGOUT',
      'VIEW_PAGE',
      'CREATE',
      'UPDATE',
      'DELETE',
      'PRINT',
      'EXPORT',
      'ARCHIVE'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON public.activity_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id
  ON public.activity_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type
  ON public.activity_logs (action_type);

CREATE INDEX IF NOT EXISTS idx_activity_logs_module
  ON public.activity_logs (module);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_logs'
      AND policyname = 'activity_logs_all_auth'
  ) THEN
    CREATE POLICY activity_logs_all_auth ON public.activity_logs
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_logs'
      AND policyname = 'activity_logs_all_anon'
  ) THEN
    CREATE POLICY activity_logs_all_anon ON public.activity_logs
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT ON public.activity_logs TO anon, authenticated;
