-- ============================================================================
-- 20260812_security_definer_hardening.sql
-- After 20260812_design_intelligence_tenant_rls / 045: close Security Advisor
-- findings on SECURITY DEFINER execute grants + missing tenant guards on live RPCs.
--
-- HARD RULES:
--   - Do NOT drop any function
--   - Do NOT create open RLS policies
--   - Do NOT change SBC/NFPA logic
--   - Prefer minimal authz wrappers (assert_client_tenant_access) over rewrites
-- Safe to re-run.
-- ============================================================================

-- ─── 1) Tenant guard (idempotent; required by wrapped RPCs) ──────────────────
CREATE OR REPLACE FUNCTION public.assert_client_tenant_access(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required for live save';
  END IF;
  IF public.is_platform_admin() THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND c.company_id = public.current_app_company_id()
  ) THEN
    RAISE EXCEPTION 'tenant_isolation: client not in your company';
  END IF;
END;
$$;

-- ─── 2) RLS session helpers — keep authenticated (used by policies) ──────────
-- Bodies unchanged from 044; reaffirm locked search_path + grants.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (
      SELECT (u.is_platform_admin = true OR u.role_code = 'super_admin')
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.deleted_at IS NULL
        AND u.is_active = true
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (
      SELECT u.company_id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.deleted_at IS NULL
        AND u.is_active = true
      LIMIT 1
    ),
    (
      SELECT tm.company_id
      FROM public.tenant_memberships tm
      JOIN public.users u ON u.id = tm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.is_default = true
      LIMIT 1
    ),
    (
      SELECT tm.company_id
      FROM public.tenant_memberships tm
      JOIN public.users u ON u.id = tm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND tm.status = 'active'
      ORDER BY tm.created_at ASC
      LIMIT 1
    )
  );
$$;

-- ─── 3) Client-facing merge/save RPCs — tenant check; drop anon later ───────
CREATE OR REPLACE FUNCTION public.merge_project_engineering_patch(
  p_client_id uuid,
  p_patch jsonb,
  p_pipeline_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_client_tenant_access(p_client_id);
  PERFORM set_config('statement_timeout', '180s', true);

  UPDATE public.clients
  SET
    project_engineering_data =
      COALESCE(project_engineering_data, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb),
    pipeline_stage = COALESCE(p_pipeline_stage, pipeline_stage),
    updated_at = now()
  WHERE id = p_client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_supervision_report_json(
  p_client_id uuid,
  p_supervision jsonb,
  p_pipeline_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_client_tenant_access(p_client_id);
  PERFORM set_config('statement_timeout', '180s', true);

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

CREATE OR REPLACE FUNCTION public.save_project_engineering_data(
  p_client_id uuid,
  p_data jsonb,
  p_pipeline_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.assert_client_tenant_access(p_client_id);
  PERFORM set_config('statement_timeout', '180s', true);

  UPDATE public.clients
  SET
    project_engineering_data = p_data,
    pipeline_stage = COALESCE(p_pipeline_stage, pipeline_stage),
    updated_at = now()
  WHERE id = p_client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.slim_project_engineering_data_urls(
  p_client_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  n integer := 0;
BEGIN
  -- NULL = cross-tenant maintenance; authenticated tenants must pass a client_id
  IF p_client_id IS NULL THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'tenant_isolation: client_id required';
    END IF;
  ELSE
    IF auth.uid() IS NOT NULL THEN
      PERFORM public.assert_client_tenant_access(p_client_id);
    END IF;
  END IF;

  PERFORM set_config('statement_timeout', '300s', true);

  WITH updated AS (
    UPDATE public.clients c
    SET
      project_engineering_data = regexp_replace(
        c.project_engineering_data::text,
        '"dataUrl"\s*:\s*"data:[^"]{2000,}"',
        '"dataUrl":null',
        'g'
      )::jsonb,
      updated_at = now()
    WHERE (p_client_id IS NULL OR c.id = p_client_id)
      AND c.project_engineering_data IS NOT NULL
      AND c.project_engineering_data::text LIKE '%data:image%'
    RETURNING 1
  )
  SELECT count(*)::integer INTO n FROM updated;

  RETURN n;
END;
$$;

-- ─── 4) Live save RPCs — wrap missing stage5; reaffirm stage4/live ───────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_project_engineering_live'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.save_project_engineering_live(
        p_client_id uuid,
        p_payload jsonb,
        p_pipeline_stage text DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_client_tenant_access(p_client_id);
        PERFORM set_config('statement_timeout', '60s', true);

        IF p_pipeline_stage IS NOT NULL THEN
          UPDATE public.clients
          SET pipeline_stage = p_pipeline_stage, updated_at = now()
          WHERE id = p_client_id;
        ELSE
          UPDATE public.clients SET updated_at = now() WHERE id = p_client_id;
        END IF;

        INSERT INTO public.project_engineering_live (client_id, payload, updated_at)
        VALUES (p_client_id, COALESCE(p_payload, '{}'::jsonb), now())
        ON CONFLICT (client_id) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = now();
      END;
      $body$;
    $fn$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_stage4_live_bundle'
  ) THEN
    EXECUTE $fn$
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
      SET search_path = pg_catalog, public
      AS $body$
      BEGIN
        PERFORM public.assert_client_tenant_access(p_client_id);
        PERFORM set_config('statement_timeout', '60s', true);

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
      $body$;
    $fn$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_stage5_live_bundle'
  ) THEN
    EXECUTE $fn$
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
      SET search_path = pg_catalog, public
      AS $body$
      DECLARE
        v_report_id uuid;
        v_visit jsonb;
        v_task jsonb;
        v_idx integer := 0;
        v_snap jsonb;
      BEGIN
        PERFORM public.assert_client_tenant_access(p_client_id);
        PERFORM set_config('statement_timeout', '60s', true);

        IF p_pipeline_stage IS NOT NULL THEN
          UPDATE public.clients
          SET pipeline_stage = p_pipeline_stage, updated_at = now()
          WHERE id = p_client_id;
        ELSE
          UPDATE public.clients SET updated_at = now() WHERE id = p_client_id;
        END IF;

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
      $body$;
    $fn$;
  END IF;
END $$;

-- ─── 5) EXECUTE grants: drop PUBLIC/anon; authenticated vs service_role ──────
DO $$
DECLARE
  r record;
  fn text;
  allow_auth boolean;
  names text[] := ARRAY[
    'current_app_company_id',
    'current_app_user_id',
    'is_platform_admin',
    'assert_client_tenant_access',
    'client_belongs_to_current_company',
    'project_belongs_to_current_company',
    'merge_project_engineering_patch',
    'merge_supervision_report_json',
    'save_project_engineering_data',
    'slim_project_engineering_data_urls',
    'save_project_engineering_live',
    'save_stage4_live_bundle',
    'save_stage5_live_bundle',
    'provision_employee_auth'
  ];
BEGIN
  FOREACH fn IN ARRAY names LOOP
    -- Auth provisioning is server-only; everything else listed stays callable by JWT users
    allow_auth := fn <> 'provision_employee_auth';

    FOR r IN
      SELECT p.oid::regprocedure AS regproc
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = fn
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.regproc);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.regproc);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.regproc);
      EXECUTE format('ALTER FUNCTION %s SET search_path TO pg_catalog, public', r.regproc);
      IF allow_auth THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.regproc);
      END IF;
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.regproc);
    END LOOP;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.assert_client_tenant_access(uuid) IS
  '20260812/041: Blocks cross-tenant live-save RPC writes';

COMMENT ON FUNCTION public.merge_project_engineering_patch(uuid, jsonb, text) IS
  '20260812: tenant-guarded lean JSONB merge into clients.project_engineering_data';

COMMENT ON FUNCTION public.merge_supervision_report_json(uuid, jsonb, text) IS
  '20260812: tenant-guarded supervision_report merge into clients.project_engineering_data';

COMMENT ON FUNCTION public.save_project_engineering_data(uuid, jsonb, text) IS
  '20260812: tenant-guarded full replace of clients.project_engineering_data';

COMMENT ON FUNCTION public.slim_project_engineering_data_urls(uuid) IS
  '20260812: tenant-guarded dataUrl slim; NULL client_id requires platform admin or no JWT';
