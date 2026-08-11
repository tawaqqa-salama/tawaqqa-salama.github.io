-- RADICAL FIX: Stage 4 (technical report + fire protection design) never rewrites
-- clients.project_engineering_data (avoids statement timeout on fat TOAST).
-- Safe to re-run. Can be applied alone.

CREATE TABLE IF NOT EXISTS public.project_stage4_live (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  technical_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  fire_protection_design jsonb NOT NULL DEFAULT '{}'::jsonb,
  workflow jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_stage4_live_updated
  ON public.project_stage4_live (updated_at DESC);

CREATE OR REPLACE FUNCTION public.save_stage4_live_bundle(
  p_client_id uuid,
  p_technical_report jsonb,
  p_fire_protection_design jsonb DEFAULT '{}'::jsonb,
  p_workflow jsonb DEFAULT '{}'::jsonb,
  p_pipeline_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '60s', true);

  -- Tiny column only — NEVER touch project_engineering_data
  IF p_pipeline_stage IS NOT NULL THEN
    UPDATE public.clients
    SET pipeline_stage = p_pipeline_stage, updated_at = now()
    WHERE id = p_client_id;
  ELSE
    UPDATE public.clients SET updated_at = now() WHERE id = p_client_id;
  END IF;

  INSERT INTO public.project_stage4_live (
    client_id, technical_report, fire_protection_design, workflow, updated_at
  )
  VALUES (
    p_client_id,
    COALESCE(p_technical_report, '{}'::jsonb),
    COALESCE(p_fire_protection_design, '{}'::jsonb),
    COALESCE(p_workflow, '{}'::jsonb),
    now()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    technical_report = EXCLUDED.technical_report,
    fire_protection_design = EXCLUDED.fire_protection_design,
    workflow = EXCLUDED.workflow,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_stage4_live_bundle(uuid, jsonb, jsonb, jsonb, text)
  TO anon, authenticated;

ALTER TABLE public.project_stage4_live ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_stage4_live' AND policyname = 'project_stage4_live_all'
  ) THEN
    CREATE POLICY project_stage4_live_all ON public.project_stage4_live
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_stage4_live TO anon, authenticated;
