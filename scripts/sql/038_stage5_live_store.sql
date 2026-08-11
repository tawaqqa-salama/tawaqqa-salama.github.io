-- RADICAL FIX: Stage 5 (visits + supervision) never rewrites project_engineering_data.
-- Live stage-5 payload lives in small dedicated tables/columns.
-- Safe to re-run. Includes minimal deps from 035/036 so it can be applied alone.

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

-- 1) Field visits — one row per visit (tiny JSON payload)
CREATE TABLE IF NOT EXISTS public.field_visit_reports (
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  visit_number integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, visit_number)
);

CREATE INDEX IF NOT EXISTS idx_field_visit_reports_client
  ON public.field_visit_reports (client_id, visit_number);

-- 2) Ensure supervision header table can hold full live report JSON (still small vs drawings)
ALTER TABLE public.project_supervision_reports
  ADD COLUMN IF NOT EXISTS live_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.project_supervision_reports
  ADD COLUMN IF NOT EXISTS pdf_snapshots jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3) PDF archive index already in 036 — ensure table exists for older DBs
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

-- 4) Atomic stage-5 save — DOES NOT touch project_engineering_data
CREATE OR REPLACE FUNCTION public.save_stage5_live_bundle(
  p_client_id uuid,
  p_field_visits jsonb,
  p_supervision jsonb,
  p_pdf_archive jsonb DEFAULT '[]'::jsonb,
  p_pipeline_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
  v_visit jsonb;
  v_task jsonb;
  v_idx integer := 0;
  v_snap jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '60s', true);

  -- Tiny column only
  IF p_pipeline_stage IS NOT NULL THEN
    UPDATE public.clients
    SET pipeline_stage = p_pipeline_stage, updated_at = now()
    WHERE id = p_client_id;
  ELSE
    UPDATE public.clients SET updated_at = now() WHERE id = p_client_id;
  END IF;

  -- Replace visit rows for this client
  DELETE FROM public.field_visit_reports WHERE client_id = p_client_id;
  IF p_field_visits IS NOT NULL AND jsonb_typeof(p_field_visits) = 'array' THEN
    FOR v_visit IN SELECT * FROM jsonb_array_elements(p_field_visits)
    LOOP
      INSERT INTO public.field_visit_reports (client_id, visit_number, payload, updated_at)
      VALUES (
        p_client_id,
        COALESCE((v_visit->>'visit_number')::integer, 0),
        v_visit,
        now()
      )
      ON CONFLICT (client_id, visit_number) DO UPDATE
      SET payload = EXCLUDED.payload, updated_at = now();
    END LOOP;
  END IF;

  -- Upsert supervision header + live payload
  INSERT INTO public.project_supervision_reports (
    client_id, status, report_date, contractor_name, branch_manager_name,
    supervising_office, safety_engineer_name, inspection_form_number, study_number,
    total_duration, start_date, overall_progress_percent, overall_progress_manual,
    notes, months, header, live_payload, pdf_snapshots, updated_at
  )
  VALUES (
    p_client_id,
    COALESCE(p_supervision->>'status', 'مسودة'),
    NULLIF(p_supervision->>'report_date', '')::date,
    p_supervision->>'contractor_name',
    p_supervision->>'branch_manager_name',
    p_supervision->>'supervising_office',
    p_supervision->>'safety_engineer_name',
    p_supervision->>'inspection_form_number',
    p_supervision->>'study_number',
    p_supervision->>'total_duration',
    NULLIF(p_supervision->>'start_date', '')::date,
    NULLIF(p_supervision->>'overall_progress_percent', '')::numeric,
    COALESCE((p_supervision->>'overall_progress_manual')::boolean, false),
    p_supervision->>'notes',
    COALESCE(p_supervision->'months', '[]'::jsonb),
    jsonb_build_object(
      'owner_name', p_supervision->>'owner_name',
      'project_name', p_supervision->>'project_name',
      'building_type', p_supervision->>'building_type',
      'area_m2', p_supervision->>'area_m2'
    ),
    COALESCE(p_supervision, '{}'::jsonb),
    COALESCE(p_supervision->'pdf_snapshots', '[]'::jsonb),
    now()
  )
  ON CONFLICT (client_id) DO UPDATE SET
    status = EXCLUDED.status,
    report_date = EXCLUDED.report_date,
    contractor_name = EXCLUDED.contractor_name,
    branch_manager_name = EXCLUDED.branch_manager_name,
    supervising_office = EXCLUDED.supervising_office,
    safety_engineer_name = EXCLUDED.safety_engineer_name,
    inspection_form_number = EXCLUDED.inspection_form_number,
    study_number = EXCLUDED.study_number,
    total_duration = EXCLUDED.total_duration,
    start_date = EXCLUDED.start_date,
    overall_progress_percent = EXCLUDED.overall_progress_percent,
    overall_progress_manual = EXCLUDED.overall_progress_manual,
    notes = EXCLUDED.notes,
    months = EXCLUDED.months,
    header = EXCLUDED.header,
    live_payload = EXCLUDED.live_payload,
    pdf_snapshots = EXCLUDED.pdf_snapshots,
    updated_at = now()
  RETURNING id INTO v_report_id;

  -- Batch replace report_items from supervision.tasks
  DELETE FROM public.report_items WHERE report_id = v_report_id;
  v_idx := 0;
  IF p_supervision ? 'tasks' AND jsonb_typeof(p_supervision->'tasks') = 'array' THEN
    FOR v_task IN SELECT * FROM jsonb_array_elements(p_supervision->'tasks')
    LOOP
      INSERT INTO public.report_items (
        id, report_id, client_id, sort_order, category_id, category_label,
        description, work_type, total_percent, month_progress, updated_at
      ) VALUES (
        COALESCE(v_task->>'id', 'task-' || v_idx::text),
        v_report_id,
        p_client_id,
        v_idx,
        v_task->>'category_id',
        v_task->>'category_label',
        v_task->>'description',
        v_task->>'work_type',
        NULLIF(v_task->>'total_percent', '')::numeric,
        COALESCE(v_task->'month_progress', '{}'::jsonb),
        now()
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  -- Append archive snapshots if provided (idempotent by storage_path+file_name)
  IF p_pdf_archive IS NOT NULL AND jsonb_typeof(p_pdf_archive) = 'array' THEN
    FOR v_snap IN SELECT * FROM jsonb_array_elements(p_pdf_archive)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.report_pdf_snapshots s
        WHERE s.client_id = p_client_id
          AND s.file_name = v_snap->>'fileName'
          AND COALESCE(s.storage_path, '') = COALESCE(v_snap->>'storagePath', '')
      ) THEN
        INSERT INTO public.report_pdf_snapshots (
          client_id, kind, visit_number, report_date, title_ar, file_name,
          size_bytes, mime_type, storage_bucket, storage_path, created_at
        ) VALUES (
          p_client_id,
          COALESCE(v_snap->>'kind', 'supervision'),
          NULLIF(v_snap->>'visit_number', '')::integer,
          NULLIF(v_snap->>'report_date', '')::date,
          COALESCE(v_snap->>'title_ar', 'مرفق PDF'),
          COALESCE(v_snap->>'fileName', 'report.pdf'),
          COALESCE((v_snap->>'sizeBytes')::bigint, 0),
          COALESCE(v_snap->>'mimeType', 'application/pdf'),
          COALESCE(v_snap->>'storageBucket', 'project-files'),
          v_snap->>'storagePath',
          COALESCE(NULLIF(v_snap->>'created_at', '')::timestamptz, now())
        );
      END IF;
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_stage5_live_bundle(uuid, jsonb, jsonb, jsonb, text)
  TO anon, authenticated;

ALTER TABLE public.field_visit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_supervision_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_pdf_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_visit_reports' AND policyname = 'field_visit_reports_all'
  ) THEN
    CREATE POLICY field_visit_reports_all ON public.field_visit_reports
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_visit_reports TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_supervision_reports TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_pdf_snapshots TO anon, authenticated;
