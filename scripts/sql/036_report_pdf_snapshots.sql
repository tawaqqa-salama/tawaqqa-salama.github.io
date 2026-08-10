-- Fixed visit/supervision report PDFs as append-only snapshots + lean JSONB patch RPC.
-- Safe to re-run.

-- Append-only PDF metadata (binary in Storage bucket project-files)
CREATE TABLE IF NOT EXISTS public.report_pdf_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('field_visit', 'supervision')),
  visit_number integer,
  report_date date,
  title_ar text NOT NULL,
  file_name text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  storage_bucket text NOT NULL DEFAULT 'project-files',
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_pdf_snapshots_client
  ON public.report_pdf_snapshots (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_pdf_snapshots_visit
  ON public.report_pdf_snapshots (client_id, kind, visit_number);

CREATE INDEX IF NOT EXISTS idx_report_pdf_snapshots_kind
  ON public.report_pdf_snapshots (client_id, kind);

-- Lean merge of selected keys inside project_engineering_data (avoids fat rewrite / timeout)
CREATE OR REPLACE FUNCTION public.merge_project_engineering_patch(
  p_client_id uuid,
  p_patch jsonb,
  p_pipeline_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '60s', true);

  UPDATE public.clients
  SET
    project_engineering_data =
      COALESCE(project_engineering_data, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb),
    pipeline_stage = COALESCE(p_pipeline_stage, pipeline_stage),
    updated_at = now()
  WHERE id = p_client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_project_engineering_patch(uuid, jsonb, text)
  TO anon, authenticated;

ALTER TABLE public.report_pdf_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'report_pdf_snapshots'
      AND policyname = 'report_pdf_snapshots_all'
  ) THEN
    CREATE POLICY report_pdf_snapshots_all ON public.report_pdf_snapshots
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_pdf_snapshots TO anon, authenticated;
