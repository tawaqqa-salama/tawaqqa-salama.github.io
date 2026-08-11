-- ============================================================================
-- 20260812 — SECURITY DEFINER hardening v2 (production-schema compatible)
-- ============================================================================
-- Replaces the failed 041 approach that referenced public.tenant_memberships
-- (relation does not exist in production).
--
-- Uses ONLY the real production tenant link:
--   auth.uid() → public.users.auth_user_id → public.users.company_id
--
-- Scope:
--   • Redefine tenant helper functions (search_path + grants)
--   • Harden client-called SECURITY DEFINER RPCs (tenant assert, revoke anon)
--
-- Does NOT:
--   • Create tenant_memberships or any compatibility tables
--   • Change SBC / NFPA logic
--   • Rewrite unrelated RLS policies
--
-- Safe to re-run.
-- ============================================================================

-- ─── 0) Preconditions (fail fast with a clear message) ───────────────────────
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'v2 hardening aborted: public.users does not exist';
  END IF;
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'v2 hardening aborted: public.clients does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'auth_user_id'
  ) THEN
    RAISE EXCEPTION 'v2 hardening aborted: public.users.auth_user_id missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'v2 hardening aborted: public.users.company_id missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'v2 hardening aborted: public.clients.company_id missing';
  END IF;
END $$;

-- ─── 1) Tenant helpers — users.company_id only ───────────────────────────────

CREATE OR REPLACE FUNCTION public.current_app_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.company_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.deleted_at IS NULL
    AND COALESCE(u.is_active, true) = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_app_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_company_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_app_company_id() TO authenticated, service_role;

COMMENT ON FUNCTION public.current_app_company_id() IS
  'v2: Resolves tenant company from auth.uid() → public.users.company_id (no memberships table)';

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

REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_user_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;

-- is_platform_admin: always use role_code; optionally OR is_platform_admin column
-- if that column exists (033 may not be applied in production).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'is_platform_admin'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.is_platform_admin()
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
        SELECT COALESCE(
          (
            SELECT (
              COALESCE(u.is_platform_admin, false) = true
              OR lower(COALESCE(u.role_code, '')) = 'super_admin'
            )
            FROM public.users u
            WHERE u.auth_user_id = auth.uid()
              AND u.deleted_at IS NULL
              AND COALESCE(u.is_active, true) = true
            LIMIT 1
          ),
          false
        );
      $body$;
    $fn$;
  ELSE
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.is_platform_admin()
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
        SELECT COALESCE(
          (
            SELECT lower(COALESCE(u.role_code, '')) = 'super_admin'
            FROM public.users u
            WHERE u.auth_user_id = auth.uid()
              AND u.deleted_at IS NULL
              AND COALESCE(u.is_active, true) = true
            LIMIT 1
          ),
          false
        );
      $body$;
    $fn$;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- ─── 2) Tenant gate for client-scoped DEFINER RPCs ───────────────────────────

CREATE OR REPLACE FUNCTION public.assert_client_tenant_access(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- service_role / backend jobs may call without an end-user JWT
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF public.is_platform_admin() THEN
    RETURN;
  END IF;

  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'tenant_isolation: client_id required';
  END IF;

  IF public.current_app_company_id() IS NULL THEN
    RAISE EXCEPTION 'tenant_isolation: no active company for current user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = p_client_id
      AND c.company_id = public.current_app_company_id()
  ) THEN
    RAISE EXCEPTION 'tenant_isolation: client not in your company';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_client_tenant_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_client_tenant_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_client_tenant_access(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.assert_client_tenant_access(uuid) IS
  'v2: Blocks cross-tenant writes in SECURITY DEFINER RPCs via clients.company_id';

-- ─── 3) Harden live / engineering DEFINER RPCs (if present) ──────────────────

DO $$
DECLARE
  has_live_payload boolean := false;
BEGIN
  -- save_project_engineering_live(uuid, jsonb, text)
  IF to_regclass('public.project_engineering_live') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
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
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_project_engineering_live(uuid, jsonb, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_project_engineering_live(uuid, jsonb, text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_project_engineering_live(uuid, jsonb, text) TO authenticated, service_role';
  END IF;

  -- save_stage4_live_bundle
  IF to_regclass('public.project_stage4_live') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
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
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_stage4_live_bundle(uuid, jsonb, jsonb, jsonb, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_stage4_live_bundle(uuid, jsonb, jsonb, jsonb, text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_stage4_live_bundle(uuid, jsonb, jsonb, jsonb, text) TO authenticated, service_role';
  END IF;

  -- save_stage5_live_bundle (body preserved from 040; tenant assert added)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_supervision_reports'
      AND column_name = 'live_payload'
  ) INTO has_live_payload;

  IF has_live_payload
     AND to_regclass('public.field_visit_reports') IS NOT NULL
     AND to_regclass('public.report_items') IS NOT NULL
     AND to_regclass('public.report_pdf_snapshots') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
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
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_stage5_live_bundle(uuid, jsonb, jsonb, jsonb, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_stage5_live_bundle(uuid, jsonb, jsonb, jsonb, text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_stage5_live_bundle(uuid, jsonb, jsonb, jsonb, text) TO authenticated, service_role';
  ELSIF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_stage5_live_bundle'
  ) THEN
    -- Function exists but supporting columns/tables differ — tighten grants only
    EXECUTE 'ALTER FUNCTION public.save_stage5_live_bundle(uuid, jsonb, jsonb, jsonb, text) SET search_path = pg_catalog, public';
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_stage5_live_bundle(uuid, jsonb, jsonb, jsonb, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_stage5_live_bundle(uuid, jsonb, jsonb, jsonb, text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_stage5_live_bundle(uuid, jsonb, jsonb, jsonb, text) TO authenticated, service_role';
    RAISE NOTICE 'v2: save_stage5_live_bundle grants hardened; body not rewritten (missing live tables/columns)';
  END IF;

  -- merge_project_engineering_patch
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'merge_project_engineering_patch'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.merge_project_engineering_patch(
        p_client_id uuid,
        p_patch jsonb,
        p_pipeline_stage text DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
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
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.merge_project_engineering_patch(uuid, jsonb, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.merge_project_engineering_patch(uuid, jsonb, text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.merge_project_engineering_patch(uuid, jsonb, text) TO authenticated, service_role';
  END IF;

  -- merge_supervision_report_json
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'merge_supervision_report_json'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.merge_supervision_report_json(
        p_client_id uuid,
        p_supervision jsonb,
        p_pipeline_stage text DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
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
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.merge_supervision_report_json(uuid, jsonb, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.merge_supervision_report_json(uuid, jsonb, text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.merge_supervision_report_json(uuid, jsonb, text) TO authenticated, service_role';
  END IF;

  -- save_project_engineering_data
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_project_engineering_data'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.save_project_engineering_data(
        p_client_id uuid,
        p_data jsonb,
        p_pipeline_stage text DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
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
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_project_engineering_data(uuid, jsonb, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_project_engineering_data(uuid, jsonb, text) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_project_engineering_data(uuid, jsonb, text) TO authenticated, service_role';
  END IF;

  -- slim_project_engineering_data_urls — NULL client_id only for platform admin / service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'slim_project_engineering_data_urls'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.slim_project_engineering_data_urls(
        p_client_id uuid DEFAULT NULL
      )
      RETURNS integer
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      AS $body$
      DECLARE
        n integer := 0;
      BEGIN
        IF coalesce(auth.role(), '') = 'service_role' THEN
          NULL; -- full access for backend maintenance
        ELSIF auth.uid() IS NULL THEN
          RAISE EXCEPTION 'authentication required';
        ELSIF p_client_id IS NULL THEN
          IF NOT public.is_platform_admin() THEN
            RAISE EXCEPTION 'tenant_isolation: p_client_id required';
          END IF;
        ELSE
          PERFORM public.assert_client_tenant_access(p_client_id);
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
            AND c.project_engineering_data::text LIKE '%data:%'
            AND (
              p_client_id IS NOT NULL
              OR coalesce(auth.role(), '') = 'service_role'
              OR public.is_platform_admin()
            )
          RETURNING 1
        )
        SELECT count(*)::integer INTO n FROM updated;
        RETURN n;
      END;
      $body$;
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.slim_project_engineering_data_urls(uuid) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.slim_project_engineering_data_urls(uuid) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.slim_project_engineering_data_urls(uuid) TO authenticated, service_role';
  END IF;
END $$;

-- ─── 4) next_document_number — bind company to caller tenant ─────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'next_document_number'
  ) THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.next_document_number(
      p_doc_kind text,
      p_company_id uuid DEFAULT NULL
    ) RETURNS text
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $body$
    DECLARE
      v_company uuid;
      v_year integer;
      v_year_key integer;
      v_yearly boolean;
      v_next integer;
      v_caller_company uuid;
    BEGIN
      IF p_doc_kind IS NULL OR btrim(p_doc_kind) = '' THEN
        RAISE EXCEPTION 'p_doc_kind مطلوب';
      END IF;

      IF coalesce(auth.role(), '') = 'service_role' THEN
        v_company := COALESCE(p_company_id, '00000000-0000-0000-0000-000000000000'::uuid);
      ELSIF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required';
      ELSE
        v_caller_company := public.current_app_company_id();
        IF public.is_platform_admin() THEN
          v_company := COALESCE(p_company_id, v_caller_company, '00000000-0000-0000-0000-000000000000'::uuid);
        ELSE
          IF v_caller_company IS NULL THEN
            RAISE EXCEPTION 'tenant_isolation: no active company for current user';
          END IF;
          IF p_company_id IS NOT NULL AND p_company_id IS DISTINCT FROM v_caller_company THEN
            RAISE EXCEPTION 'tenant_isolation: company mismatch';
          END IF;
          v_company := v_caller_company;
        END IF;
      END IF;

      v_year := EXTRACT(YEAR FROM timezone('Asia/Riyadh', now()))::integer;
      v_yearly := p_doc_kind <> 'client';
      v_year_key := CASE WHEN v_yearly THEN v_year ELSE 0 END;

      INSERT INTO public.document_sequences (company_id, doc_kind, year_key, last_value)
      VALUES (v_company, p_doc_kind, v_year_key, 0)
      ON CONFLICT (company_id, doc_kind, year_key) DO NOTHING;

      UPDATE public.document_sequences
      SET
        last_value = last_value + 1,
        updated_at = now()
      WHERE company_id = v_company
        AND doc_kind = p_doc_kind
        AND year_key = v_year_key
      RETURNING last_value INTO v_next;

      IF v_next IS NULL THEN
        RAISE EXCEPTION 'تعذر إصدار رقم تسلسلي للنوع %', p_doc_kind;
      END IF;

      RETURN public.format_document_number(p_doc_kind, v_next, v_year);
    END;
    $body$;
  $fn$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.next_document_number(text, uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.next_document_number(text, uuid) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.next_document_number(text, uuid) TO authenticated, service_role';
END $$;

-- format_document_number is IMMUTABLE (not DEFINER) but was granted to anon — tighten
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'format_document_number'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.format_document_number(text, integer, integer) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.format_document_number(text, integer, integer) FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.format_document_number(text, integer, integer) TO authenticated, service_role';
  END IF;
END $$;

-- ─── 5) Harden search_path + revoke anon on role helpers IF they already exist ─
-- (042–044 may not be applied; do not create them here.)

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid,
           n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'current_app_role_code',
        'app_role_in',
        'app_can_manage_users',
        'app_can_read_finance',
        'app_can_write_finance',
        'app_can_manage_tenant_settings',
        'app_users_self_update_ok',
        'app_can_update_user_row',
        'app_can_insert_user_row',
        'app_is_platform_privilege_role',
        'app_is_tenant_assignable_role'
      )
  LOOP
    -- Lock search_path without rewriting bodies
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public',
      r.proname,
      r.args
    );
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
      r.proname,
      r.args
    );
  END LOOP;
END $$;
