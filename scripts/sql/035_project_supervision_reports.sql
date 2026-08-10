-- Periodic supervision / progress follow-up tables.
-- Splits large "جدول متابعة الأعمال" payloads out of clients.project_engineering_data
-- so saves do not hit Postgres statement_timeout on fat JSONB rewrites.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.project_supervision_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'مسودة',
  report_date date,
  contractor_name text,
  branch_manager_name text,
  supervising_office text,
  safety_engineer_name text,
  inspection_form_number text,
  study_number text,
  total_duration text,
  start_date date,
  overall_progress_percent numeric,
  overall_progress_manual boolean NOT NULL DEFAULT false,
  notes text,
  months jsonb NOT NULL DEFAULT '[]'::jsonb,
  header jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

CREATE INDEX IF NOT EXISTS idx_project_supervision_reports_client
  ON public.project_supervision_reports (client_id);

CREATE INDEX IF NOT EXISTS idx_project_supervision_reports_company
  ON public.project_supervision_reports (company_id);

CREATE INDEX IF NOT EXISTS idx_project_supervision_reports_updated
  ON public.project_supervision_reports (updated_at DESC);

-- Progress rows for "جدول متابعة الأعمال" (batch upsert; avoid per-item UPDATE loops)
CREATE TABLE IF NOT EXISTS public.report_items (
  id text NOT NULL,
  report_id uuid NOT NULL REFERENCES public.project_supervision_reports(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  category_id text,
  category_label text,
  description text,
  work_type text,
  total_percent numeric,
  month_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, id)
);

CREATE INDEX IF NOT EXISTS idx_report_items_report
  ON public.report_items (report_id);

CREATE INDEX IF NOT EXISTS idx_report_items_client
  ON public.report_items (client_id);

CREATE INDEX IF NOT EXISTS idx_report_items_client_sort
  ON public.report_items (client_id, sort_order);

-- Extended-timeout write for fat project_engineering_data JSONB (fallback path)
CREATE OR REPLACE FUNCTION public.save_project_engineering_data(
  p_client_id uuid,
  p_data jsonb,
  p_pipeline_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Avoid canceling statement due to statement timeout on large JSONB updates
  PERFORM set_config('statement_timeout', '120s', true);

  UPDATE public.clients
  SET
    project_engineering_data = p_data,
    pipeline_stage = COALESCE(p_pipeline_stage, pipeline_stage),
    updated_at = now()
  WHERE id = p_client_id;
END;
$$;

-- Lean merge: only patch supervision_report key (avoids rewriting blueprint dataUrls)
CREATE OR REPLACE FUNCTION public.merge_supervision_report_json(
  p_client_id uuid,
  p_supervision jsonb,
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
      COALESCE(project_engineering_data, '{}'::jsonb)
      || jsonb_build_object('supervision_report', p_supervision),
    pipeline_stage = COALESCE(p_pipeline_stage, pipeline_stage),
    updated_at = now()
  WHERE id = p_client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_project_engineering_data(uuid, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_supervision_report_json(uuid, jsonb, text) TO anon, authenticated;

ALTER TABLE public.project_supervision_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_supervision_reports' AND policyname = 'psr_all'
  ) THEN
    CREATE POLICY psr_all ON public.project_supervision_reports
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'report_items' AND policyname = 'report_items_all'
  ) THEN
    CREATE POLICY report_items_all ON public.report_items
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_supervision_reports TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_items TO anon, authenticated;
