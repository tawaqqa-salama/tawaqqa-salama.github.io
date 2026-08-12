-- ============================================================================
-- 20260812 — SECURITY DEFINER hardening v3 (overload-safe, audit-locked)
-- ============================================================================
-- Hardens ONLY canonical signatures confirmed by the overload audit.
-- Does NOT create a function/overload when that exact signature is absent.
--
-- Tenant link: auth.uid() → public.users.company_id
-- Role column: public.users.role_code (never users.role)
-- No tenant_memberships / compatibility DDL / SBC-NFPA / unrelated RLS.
--
-- Idempotent. Safe to re-run. Do NOT invent DROP of overloads.
-- ============================================================================

-- ─── helpers (session-temp): classify / revoke / grant by exact identity ─────

CREATE TEMP TABLE IF NOT EXISTS _v3_actions (
  proname text NOT NULL,
  identity_args text NOT NULL,
  typelist text NOT NULL,
  kind text NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

TRUNCATE _v3_actions;

CREATE OR REPLACE FUNCTION pg_temp.v3_typelist(p_oid oid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(oidvectortypes((SELECT proargtypes FROM pg_proc WHERE oid = p_oid)), '');
$$;

CREATE OR REPLACE FUNCTION pg_temp.v3_ident(p_oid oid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(pg_get_function_identity_arguments(p_oid), '');
$$;

-- Revoke EXECUTE on an existing overload (no-op if missing).
-- PUBLIC must be unquoted; other roles use %I.
CREATE OR REPLACE FUNCTION pg_temp.v3_revoke_execute(
  p_proname text,
  p_ident text,
  VARIADIC p_roles text[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  role_name text;
  sql text;
BEGIN
  FOREACH role_name IN ARRAY p_roles LOOP
    BEGIN
      IF upper(role_name) = 'PUBLIC' THEN
        sql := format(
          'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
          p_proname,
          p_ident
        );
      ELSE
        sql := format(
          'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM %I',
          p_proname,
          p_ident,
          role_name
        );
      END IF;
      EXECUTE sql;
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
      WHEN undefined_object THEN
        NULL;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.v3_grant_execute(
  p_proname text,
  p_ident text,
  VARIADIC p_roles text[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY p_roles LOOP
    IF upper(role_name) = 'PUBLIC' THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO PUBLIC',
        p_proname,
        p_ident
      );
    ELSE
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO %I',
        p_proname,
        p_ident,
        role_name
      );
    END IF;
  END LOOP;
END;
$$;

-- Enumerate overloads: revoke unexpected; return oid of canonical typelist or NULL.
CREATE OR REPLACE FUNCTION pg_temp.v3_find_canonical(
  p_proname text,
  p_canonical_typelist text
)
RETURNS oid
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  canon oid := NULL;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = p_proname
  LOOP
    n := n + 1;
    IF pg_temp.v3_typelist(r.oid) = p_canonical_typelist THEN
      canon := r.oid;
      INSERT INTO _v3_actions(proname, identity_args, typelist, kind, detail)
      VALUES (
        p_proname,
        pg_temp.v3_ident(r.oid),
        p_canonical_typelist,
        'canonical',
        'will harden this exact overload'
      );
    ELSE
      -- Obsolete / unexpected overload: revoke client-facing EXECUTE only if it exists
      PERFORM pg_temp.v3_revoke_execute(
        p_proname,
        pg_temp.v3_ident(r.oid),
        VARIADIC ARRAY['PUBLIC', 'anon', 'authenticated']
      );
      INSERT INTO _v3_actions(proname, identity_args, typelist, kind, detail)
      VALUES (
        p_proname,
        pg_temp.v3_ident(r.oid),
        pg_temp.v3_typelist(r.oid),
        'obsolete',
        'REVOKE EXECUTE FROM PUBLIC, anon, authenticated (left in place; no DROP)'
      );
      RAISE NOTICE 'v3: revoked EXECUTE on unexpected overload %(%)',
        p_proname, pg_temp.v3_ident(r.oid);
    END IF;
  END LOOP;

  IF n = 0 THEN
    INSERT INTO _v3_actions(proname, identity_args, typelist, kind, detail)
    VALUES (
      p_proname,
      '',
      p_canonical_typelist,
      'absent',
      'no overloads — left unchanged (not created)'
    );
  ELSIF canon IS NULL THEN
    INSERT INTO _v3_actions(proname, identity_args, typelist, kind, detail)
    VALUES (
      p_proname,
      '',
      p_canonical_typelist,
      'absent_canonical',
      'canonical typelist missing — NOT creating assumed signature'
    );
    RAISE NOTICE
      'v3: % — canonical typelist [%] absent; skipped CREATE',
      p_proname, p_canonical_typelist;
  END IF;

  RETURN canon;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.v3_harden_grants(p_proname text, p_ident text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- REVOKE EXECUTE FROM PUBLIC / anon; grant authenticated + service_role
  PERFORM pg_temp.v3_revoke_execute(
    p_proname, p_ident, VARIADIC ARRAY['PUBLIC', 'anon']
  );
  PERFORM pg_temp.v3_grant_execute(
    p_proname, p_ident, VARIADIC ARRAY['authenticated', 'service_role']
  );
  EXECUTE format(
    'ALTER FUNCTION public.%I(%s) SET search_path = public',
    p_proname,
    p_ident
  );
END;
$$;

-- True only when canonical zero-arg public.current_app_company_id() exists.
CREATE OR REPLACE FUNCTION pg_temp.v3_has_company_resolver()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = 'current_app_company_id'
      AND COALESCE(oidvectortypes(p.proargtypes), '') = ''
  );
$$;

-- Returns comma-separated missing "table.column" (empty string if all present).
CREATE OR REPLACE FUNCTION pg_temp.v3_missing_columns(
  p_table text,
  p_columns text[]
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  col text;
  missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN 'table:public.' || p_table;
  END IF;
  FOREACH col IN ARRAY p_columns LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table
        AND column_name = col
    ) THEN
      missing := array_append(missing, p_table || '.' || col);
    END IF;
  END LOOP;
  RETURN array_to_string(missing, ', ');
END;
$$;

-- Full schema gate for rewritten save_stage5_live_bundle body.
CREATE OR REPLACE FUNCTION pg_temp.v3_stage5_rewrite_blockers()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  parts text[] := ARRAY[]::text[];
  m text;
BEGIN
  m := pg_temp.v3_missing_columns('clients', ARRAY[
    'id', 'company_id', 'pipeline_stage', 'updated_at'
  ]);
  IF m <> '' THEN parts := array_append(parts, m); END IF;

  m := pg_temp.v3_missing_columns('field_visit_reports', ARRAY[
    'client_id', 'visit_number', 'payload', 'updated_at'
  ]);
  IF m <> '' THEN parts := array_append(parts, m); END IF;

  m := pg_temp.v3_missing_columns('project_supervision_reports', ARRAY[
    'id', 'client_id', 'status', 'report_date', 'contractor_name',
    'branch_manager_name', 'supervising_office', 'safety_engineer_name',
    'inspection_form_number', 'study_number', 'total_duration', 'start_date',
    'overall_progress_percent', 'overall_progress_manual', 'notes', 'months',
    'header', 'live_payload', 'pdf_snapshots', 'updated_at'
  ]);
  IF m <> '' THEN parts := array_append(parts, m); END IF;

  m := pg_temp.v3_missing_columns('report_items', ARRAY[
    'id', 'report_id', 'client_id', 'sort_order', 'category_id',
    'category_label', 'description', 'work_type', 'total_percent',
    'month_progress', 'updated_at'
  ]);
  IF m <> '' THEN parts := array_append(parts, m); END IF;

  m := pg_temp.v3_missing_columns('report_pdf_snapshots', ARRAY[
    'client_id', 'kind', 'visit_number', 'report_date', 'title_ar',
    'file_name', 'size_bytes', 'mime_type', 'storage_bucket',
    'storage_path', 'created_at'
  ]);
  IF m <> '' THEN parts := array_append(parts, m); END IF;

  RETURN array_to_string(parts, '; ');
END;
$$;

-- Shared tenant gate (SQL snippet logic inlined into DEFINER bodies below):
--   service_role → allow
--   else require auth.uid()
--   else require clients.company_id = users.company_id for auth.uid()
--   super_admin (role_code) may bypass client company match
-- Bodies that call public.current_app_company_id() are rewritten ONLY when
-- the canonical 0-arg resolver already exists (never created here as fallback).

-- ─── 0) current_app_company_id() — harden only if 0-arg already exists ───────
DO $$
DECLARE
  canon oid;
  ident text;
BEGIN
  canon := pg_temp.v3_find_canonical('current_app_company_id', '');
  IF canon IS NULL THEN
    UPDATE _v3_actions
      SET detail = detail
        || ' — NOT created; dependent body rewrites that call current_app_company_id() will skip body changes'
      WHERE proname = 'current_app_company_id'
        AND kind IN ('absent', 'absent_canonical');
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.current_app_company_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $f$
    SELECT u.company_id
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.deleted_at IS NULL
      AND COALESCE(u.is_active, true) = true
    LIMIT 1;
  $f$;

  ident := COALESCE(
    (
      SELECT pg_temp.v3_ident(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'current_app_company_id'
        AND COALESCE(oidvectortypes(p.proargtypes), '') = ''
      LIMIT 1
    ),
    pg_temp.v3_ident(canon)
  );
  PERFORM pg_temp.v3_harden_grants('current_app_company_id', ident);
  UPDATE _v3_actions
    SET detail = 'CREATE OR REPLACE existing 0-arg + search_path=public + REVOKE PUBLIC/anon + GRANT authenticated/service_role'
    WHERE proname = 'current_app_company_id' AND kind = 'canonical';
END $$;

-- ─── 1) save_project_engineering_live(uuid, jsonb, text) ─────────────────────
DO $$
DECLARE
  canon oid;
  ident text;
  skip_reason text := NULL;
BEGIN
  canon := pg_temp.v3_find_canonical('save_project_engineering_live', 'uuid, jsonb, text');
  IF canon IS NULL THEN
    RETURN;
  END IF;
  ident := pg_temp.v3_ident(canon);

  IF NOT pg_temp.v3_has_company_resolver() THEN
    skip_reason := 'current_app_company_id() 0-arg missing';
  ELSIF to_regclass('public.project_engineering_live') IS NULL THEN
    skip_reason := 'project_engineering_live table missing';
  ELSIF pg_temp.v3_missing_columns(
    'project_engineering_live', ARRAY['client_id', 'payload', 'updated_at']
  ) <> '' THEN
    skip_reason := pg_temp.v3_missing_columns(
      'project_engineering_live', ARRAY['client_id', 'payload', 'updated_at']
    );
  ELSIF pg_temp.v3_missing_columns(
    'clients', ARRAY['id', 'company_id', 'pipeline_stage', 'updated_at']
  ) <> '' THEN
    skip_reason := pg_temp.v3_missing_columns(
      'clients', ARRAY['id', 'company_id', 'pipeline_stage', 'updated_at']
    );
  END IF;

  IF skip_reason IS NOT NULL THEN
    PERFORM pg_temp.v3_harden_grants('save_project_engineering_live', ident);
    UPDATE _v3_actions
      SET detail = 'grants+search_path only — body rewrite skipped: ' || skip_reason
      WHERE proname = 'save_project_engineering_live' AND kind = 'canonical';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.save_project_engineering_live(
    p_client_id uuid,
    p_payload jsonb,
    p_pipeline_stage text DEFAULT NULL
  )
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $body$
  BEGIN
    IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.deleted_at IS NULL
          AND COALESCE(u.is_active, true) = true
          AND lower(COALESCE(u.role_code, '')) = 'super_admin'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = p_client_id
          AND c.company_id = public.current_app_company_id()
      ) THEN
        RAISE EXCEPTION 'tenant_isolation: client not in your company';
      END IF;
    END IF;

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

  SELECT pg_temp.v3_ident(p.oid) INTO ident
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'save_project_engineering_live'
    AND COALESCE(oidvectortypes(p.proargtypes), '') = 'uuid, jsonb, text'
  LIMIT 1;
  PERFORM pg_temp.v3_harden_grants('save_project_engineering_live', ident);
  UPDATE _v3_actions
    SET detail = 'body tenant check + search_path=public + REVOKE PUBLIC/anon + GRANT authenticated/service_role'
    WHERE proname = 'save_project_engineering_live' AND kind = 'canonical';
END $$;

-- ─── 2) save_stage4_live_bundle(uuid, jsonb, jsonb, jsonb, text) ─────────────
DO $$
DECLARE
  canon oid;
  ident text;
  skip_reason text := NULL;
BEGIN
  canon := pg_temp.v3_find_canonical('save_stage4_live_bundle', 'uuid, jsonb, jsonb, jsonb, text');
  IF canon IS NULL THEN
    RETURN;
  END IF;
  ident := pg_temp.v3_ident(canon);

  IF NOT pg_temp.v3_has_company_resolver() THEN
    skip_reason := 'current_app_company_id() 0-arg missing';
  ELSIF to_regclass('public.project_stage4_live') IS NULL THEN
    skip_reason := 'project_stage4_live table missing';
  ELSIF pg_temp.v3_missing_columns(
    'project_stage4_live',
    ARRAY['client_id', 'technical_report', 'fire_protection_design', 'workflow', 'updated_at']
  ) <> '' THEN
    skip_reason := pg_temp.v3_missing_columns(
      'project_stage4_live',
      ARRAY['client_id', 'technical_report', 'fire_protection_design', 'workflow', 'updated_at']
    );
  ELSIF pg_temp.v3_missing_columns(
    'clients', ARRAY['id', 'company_id', 'pipeline_stage', 'updated_at']
  ) <> '' THEN
    skip_reason := pg_temp.v3_missing_columns(
      'clients', ARRAY['id', 'company_id', 'pipeline_stage', 'updated_at']
    );
  END IF;

  IF skip_reason IS NOT NULL THEN
    PERFORM pg_temp.v3_harden_grants('save_stage4_live_bundle', ident);
    UPDATE _v3_actions
      SET detail = 'grants+search_path only — body rewrite skipped: ' || skip_reason
      WHERE proname = 'save_stage4_live_bundle' AND kind = 'canonical';
    RETURN;
  END IF;

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
  AS $body$
  BEGIN
    IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.deleted_at IS NULL
          AND COALESCE(u.is_active, true) = true
          AND lower(COALESCE(u.role_code, '')) = 'super_admin'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = p_client_id
          AND c.company_id = public.current_app_company_id()
      ) THEN
        RAISE EXCEPTION 'tenant_isolation: client not in your company';
      END IF;
    END IF;

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

  SELECT pg_temp.v3_ident(p.oid) INTO ident
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'save_stage4_live_bundle'
    AND COALESCE(oidvectortypes(p.proargtypes), '') = 'uuid, jsonb, jsonb, jsonb, text'
  LIMIT 1;
  PERFORM pg_temp.v3_harden_grants('save_stage4_live_bundle', ident);
  UPDATE _v3_actions
    SET detail = 'body tenant check + search_path=public + REVOKE PUBLIC/anon + GRANT authenticated/service_role'
    WHERE proname = 'save_stage4_live_bundle' AND kind = 'canonical';
END $$;

-- ─── 3) save_stage5_live_bundle(uuid, jsonb, jsonb, jsonb, text) ─────────────
DO $$
DECLARE
  canon oid;
  ident text;
  blockers text;
BEGIN
  canon := pg_temp.v3_find_canonical('save_stage5_live_bundle', 'uuid, jsonb, jsonb, jsonb, text');
  IF canon IS NULL THEN
    RETURN;
  END IF;

  ident := pg_temp.v3_ident(canon);
  blockers := pg_temp.v3_stage5_rewrite_blockers();
  IF NOT pg_temp.v3_has_company_resolver() THEN
    IF blockers = '' THEN
      blockers := 'current_app_company_id() 0-arg missing';
    ELSE
      blockers := blockers || '; current_app_company_id() 0-arg missing';
    END IF;
  END IF;

  IF blockers <> '' THEN
    PERFORM pg_temp.v3_harden_grants('save_stage5_live_bundle', ident);
    UPDATE _v3_actions
      SET detail = 'grants+search_path only — body rewrite skipped: ' || blockers
      WHERE proname = 'save_stage5_live_bundle' AND kind = 'canonical';
    RETURN;
  END IF;

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
  AS $body$
  DECLARE
    v_report_id uuid;
    v_visit jsonb;
    v_task jsonb;
    v_idx integer := 0;
    v_snap jsonb;
  BEGIN
    IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.deleted_at IS NULL
          AND COALESCE(u.is_active, true) = true
          AND lower(COALESCE(u.role_code, '')) = 'super_admin'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = p_client_id
          AND c.company_id = public.current_app_company_id()
      ) THEN
        RAISE EXCEPTION 'tenant_isolation: client not in your company';
      END IF;
    END IF;

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

  SELECT pg_temp.v3_ident(p.oid) INTO ident
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'save_stage5_live_bundle'
    AND COALESCE(oidvectortypes(p.proargtypes), '') = 'uuid, jsonb, jsonb, jsonb, text'
  LIMIT 1;
  PERFORM pg_temp.v3_harden_grants('save_stage5_live_bundle', ident);
  UPDATE _v3_actions
    SET detail = 'body tenant check + search_path=public + REVOKE PUBLIC/anon + GRANT authenticated/service_role'
    WHERE proname = 'save_stage5_live_bundle' AND kind = 'canonical';
END $$;

-- ─── 4) merge_project_engineering_patch(uuid, jsonb, text) ───────────────────
DO $$
DECLARE
  canon oid;
  ident text;
  skip_reason text := NULL;
BEGIN
  canon := pg_temp.v3_find_canonical('merge_project_engineering_patch', 'uuid, jsonb, text');
  IF canon IS NULL THEN
    RETURN;
  END IF;
  ident := pg_temp.v3_ident(canon);

  IF NOT pg_temp.v3_has_company_resolver() THEN
    skip_reason := 'current_app_company_id() 0-arg missing';
  ELSIF pg_temp.v3_missing_columns(
    'clients',
    ARRAY['id', 'company_id', 'pipeline_stage', 'updated_at', 'project_engineering_data']
  ) <> '' THEN
    skip_reason := pg_temp.v3_missing_columns(
      'clients',
      ARRAY['id', 'company_id', 'pipeline_stage', 'updated_at', 'project_engineering_data']
    );
  END IF;

  IF skip_reason IS NOT NULL THEN
    PERFORM pg_temp.v3_harden_grants('merge_project_engineering_patch', ident);
    UPDATE _v3_actions
      SET detail = 'grants+search_path only — body rewrite skipped: ' || skip_reason
      WHERE proname = 'merge_project_engineering_patch' AND kind = 'canonical';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.merge_project_engineering_patch(
    p_client_id uuid,
    p_patch jsonb,
    p_pipeline_stage text DEFAULT NULL
  )
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $body$
  BEGIN
    IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.deleted_at IS NULL
          AND COALESCE(u.is_active, true) = true
          AND lower(COALESCE(u.role_code, '')) = 'super_admin'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = p_client_id
          AND c.company_id = public.current_app_company_id()
      ) THEN
        RAISE EXCEPTION 'tenant_isolation: client not in your company';
      END IF;
    END IF;

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

  SELECT pg_temp.v3_ident(p.oid) INTO ident
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'merge_project_engineering_patch'
    AND COALESCE(oidvectortypes(p.proargtypes), '') = 'uuid, jsonb, text'
  LIMIT 1;
  PERFORM pg_temp.v3_harden_grants('merge_project_engineering_patch', ident);
  UPDATE _v3_actions
    SET detail = 'body tenant check + search_path=public + REVOKE PUBLIC/anon + GRANT authenticated/service_role'
    WHERE proname = 'merge_project_engineering_patch' AND kind = 'canonical';
END $$;

-- ─── 5) merge_supervision_report_json(uuid, jsonb, text) ─────────────────────
DO $$
DECLARE
  canon oid;
  ident text;
  skip_reason text := NULL;
BEGIN
  canon := pg_temp.v3_find_canonical('merge_supervision_report_json', 'uuid, jsonb, text');
  IF canon IS NULL THEN
    RETURN;
  END IF;
  ident := pg_temp.v3_ident(canon);

  IF NOT pg_temp.v3_has_company_resolver() THEN
    skip_reason := 'current_app_company_id() 0-arg missing';
  ELSIF pg_temp.v3_missing_columns(
    'clients',
    ARRAY['id', 'company_id', 'pipeline_stage', 'updated_at', 'project_engineering_data']
  ) <> '' THEN
    skip_reason := pg_temp.v3_missing_columns(
      'clients',
      ARRAY['id', 'company_id', 'pipeline_stage', 'updated_at', 'project_engineering_data']
    );
  END IF;

  IF skip_reason IS NOT NULL THEN
    PERFORM pg_temp.v3_harden_grants('merge_supervision_report_json', ident);
    UPDATE _v3_actions
      SET detail = 'grants+search_path only — body rewrite skipped: ' || skip_reason
      WHERE proname = 'merge_supervision_report_json' AND kind = 'canonical';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.merge_supervision_report_json(
    p_client_id uuid,
    p_supervision jsonb,
    p_pipeline_stage text DEFAULT NULL
  )
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $body$
  BEGIN
    IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.deleted_at IS NULL
          AND COALESCE(u.is_active, true) = true
          AND lower(COALESCE(u.role_code, '')) = 'super_admin'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = p_client_id
          AND c.company_id = public.current_app_company_id()
      ) THEN
        RAISE EXCEPTION 'tenant_isolation: client not in your company';
      END IF;
    END IF;

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

  SELECT pg_temp.v3_ident(p.oid) INTO ident
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'merge_supervision_report_json'
    AND COALESCE(oidvectortypes(p.proargtypes), '') = 'uuid, jsonb, text'
  LIMIT 1;
  PERFORM pg_temp.v3_harden_grants('merge_supervision_report_json', ident);
  UPDATE _v3_actions
    SET detail = 'body tenant check + search_path=public + REVOKE PUBLIC/anon + GRANT authenticated/service_role'
    WHERE proname = 'merge_supervision_report_json' AND kind = 'canonical';
END $$;

-- ─── 6) save_project_engineering_data(uuid, jsonb, text) ─────────────────────
DO $$
DECLARE
  canon oid;
  ident text;
  skip_reason text := NULL;
BEGIN
  canon := pg_temp.v3_find_canonical('save_project_engineering_data', 'uuid, jsonb, text');
  IF canon IS NULL THEN
    RETURN;
  END IF;
  ident := pg_temp.v3_ident(canon);

  IF NOT pg_temp.v3_has_company_resolver() THEN
    skip_reason := 'current_app_company_id() 0-arg missing';
  ELSIF pg_temp.v3_missing_columns(
    'clients',
    ARRAY['id', 'company_id', 'pipeline_stage', 'updated_at', 'project_engineering_data']
  ) <> '' THEN
    skip_reason := pg_temp.v3_missing_columns(
      'clients',
      ARRAY['id', 'company_id', 'pipeline_stage', 'updated_at', 'project_engineering_data']
    );
  END IF;

  IF skip_reason IS NOT NULL THEN
    PERFORM pg_temp.v3_harden_grants('save_project_engineering_data', ident);
    UPDATE _v3_actions
      SET detail = 'grants+search_path only — body rewrite skipped: ' || skip_reason
      WHERE proname = 'save_project_engineering_data' AND kind = 'canonical';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.save_project_engineering_data(
    p_client_id uuid,
    p_data jsonb,
    p_pipeline_stage text DEFAULT NULL
  )
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $body$
  BEGIN
    IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.deleted_at IS NULL
          AND COALESCE(u.is_active, true) = true
          AND lower(COALESCE(u.role_code, '')) = 'super_admin'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = p_client_id
          AND c.company_id = public.current_app_company_id()
      ) THEN
        RAISE EXCEPTION 'tenant_isolation: client not in your company';
      END IF;
    END IF;

    PERFORM set_config('statement_timeout', '180s', true);
    UPDATE public.clients
    SET
      project_engineering_data = p_data,
      pipeline_stage = COALESCE(p_pipeline_stage, pipeline_stage),
      updated_at = now()
    WHERE id = p_client_id;
  END;
  $body$;

  SELECT pg_temp.v3_ident(p.oid) INTO ident
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'save_project_engineering_data'
    AND COALESCE(oidvectortypes(p.proargtypes), '') = 'uuid, jsonb, text'
  LIMIT 1;
  PERFORM pg_temp.v3_harden_grants('save_project_engineering_data', ident);
  UPDATE _v3_actions
    SET detail = 'body tenant check + search_path=public + REVOKE PUBLIC/anon + GRANT authenticated/service_role'
    WHERE proname = 'save_project_engineering_data' AND kind = 'canonical';
END $$;

-- ─── 7) slim_project_engineering_data_urls(uuid) — reject NULL client ────────
DO $$
DECLARE
  canon oid;
  ident text;
  skip_reason text := NULL;
BEGIN
  canon := pg_temp.v3_find_canonical('slim_project_engineering_data_urls', 'uuid');
  IF canon IS NULL THEN
    RETURN;
  END IF;
  ident := pg_temp.v3_ident(canon);

  IF NOT pg_temp.v3_has_company_resolver() THEN
    skip_reason := 'current_app_company_id() 0-arg missing';
  ELSIF pg_temp.v3_missing_columns(
    'clients',
    ARRAY['id', 'company_id', 'updated_at', 'project_engineering_data']
  ) <> '' THEN
    skip_reason := pg_temp.v3_missing_columns(
      'clients',
      ARRAY['id', 'company_id', 'updated_at', 'project_engineering_data']
    );
  END IF;

  IF skip_reason IS NOT NULL THEN
    PERFORM pg_temp.v3_harden_grants('slim_project_engineering_data_urls', ident);
    UPDATE _v3_actions
      SET detail = 'grants+search_path only — body rewrite skipped: ' || skip_reason
      WHERE proname = 'slim_project_engineering_data_urls' AND kind = 'canonical';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.slim_project_engineering_data_urls(
    p_client_id uuid DEFAULT NULL
  )
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $body$
  DECLARE
    n integer := 0;
  BEGIN
    -- Reject NULL client/tenant context (no platform-admin / service_role bypass)
    IF p_client_id IS NULL THEN
      RAISE EXCEPTION 'tenant_isolation: p_client_id is required';
    END IF;

    IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.deleted_at IS NULL
          AND COALESCE(u.is_active, true) = true
          AND lower(COALESCE(u.role_code, '')) = 'super_admin'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = p_client_id
          AND c.company_id = public.current_app_company_id()
      ) THEN
        RAISE EXCEPTION 'tenant_isolation: client not in your company';
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
      WHERE c.id = p_client_id
        AND c.project_engineering_data IS NOT NULL
        AND c.project_engineering_data::text LIKE '%data:%'
      RETURNING 1
    )
    SELECT count(*)::integer INTO n FROM updated;
    RETURN n;
  END;
  $body$;

  SELECT pg_temp.v3_ident(p.oid) INTO ident
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'slim_project_engineering_data_urls'
    AND COALESCE(oidvectortypes(p.proargtypes), '') = 'uuid'
  LIMIT 1;
  PERFORM pg_temp.v3_harden_grants('slim_project_engineering_data_urls', ident);
  UPDATE _v3_actions
    SET detail = 'NULL client rejected + tenant check + search_path=public + grants'
    WHERE proname = 'slim_project_engineering_data_urls' AND kind = 'canonical';
END $$;

-- ─── 8) next_document_number(text, uuid) — bind to users.company_id ──────────
DO $$
DECLARE
  canon oid;
  ident text;
  skip_reason text := NULL;
BEGIN
  canon := pg_temp.v3_find_canonical('next_document_number', 'text, uuid');
  IF canon IS NULL THEN
    RETURN;
  END IF;
  ident := pg_temp.v3_ident(canon);

  IF NOT pg_temp.v3_has_company_resolver() THEN
    skip_reason := 'current_app_company_id() 0-arg missing';
  ELSIF to_regclass('public.document_sequences') IS NULL THEN
    skip_reason := 'document_sequences table missing';
  ELSIF pg_temp.v3_missing_columns(
    'document_sequences',
    ARRAY['company_id', 'doc_kind', 'year_key', 'last_value', 'updated_at']
  ) <> '' THEN
    skip_reason := pg_temp.v3_missing_columns(
      'document_sequences',
      ARRAY['company_id', 'doc_kind', 'year_key', 'last_value', 'updated_at']
    );
  END IF;

  IF skip_reason IS NOT NULL THEN
    PERFORM pg_temp.v3_harden_grants('next_document_number', ident);
    UPDATE _v3_actions
      SET detail = 'grants+search_path only — body rewrite skipped: ' || skip_reason
      WHERE proname = 'next_document_number' AND kind = 'canonical';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.next_document_number(
    p_doc_kind text,
    p_company_id uuid DEFAULT NULL
  ) RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
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
    ELSE
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required';
      END IF;

      -- Always bind to the authenticated user's public.users.company_id
      v_caller_company := public.current_app_company_id();
      IF v_caller_company IS NULL THEN
        RAISE EXCEPTION 'tenant_isolation: no active company for current user';
      END IF;
      IF p_company_id IS NOT NULL AND p_company_id IS DISTINCT FROM v_caller_company THEN
        RAISE EXCEPTION 'tenant_isolation: company mismatch';
      END IF;
      v_company := v_caller_company;
    END IF;

    v_year := EXTRACT(YEAR FROM timezone('Asia/Riyadh', now()))::integer;
    v_yearly := p_doc_kind <> 'client';
    v_year_key := CASE WHEN v_yearly THEN v_year ELSE 0 END;

    INSERT INTO public.document_sequences (company_id, doc_kind, year_key, last_value)
    VALUES (v_company, p_doc_kind, v_year_key, 0)
    ON CONFLICT (company_id, doc_kind, year_key) DO NOTHING;

    UPDATE public.document_sequences
    SET last_value = last_value + 1, updated_at = now()
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

  SELECT pg_temp.v3_ident(p.oid) INTO ident
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'next_document_number'
    AND COALESCE(oidvectortypes(p.proargtypes), '') = 'text, uuid'
  LIMIT 1;
  PERFORM pg_temp.v3_harden_grants('next_document_number', ident);
  UPDATE _v3_actions
    SET detail = 'bind p_company_id to users.company_id + search_path=public + grants'
    WHERE proname = 'next_document_number' AND kind = 'canonical';
END $$;

-- ─── 9) format_document_number(text, integer, integer) — grants only ─────────
DO $$
DECLARE
  canon oid;
  ident text;
BEGIN
  canon := pg_temp.v3_find_canonical('format_document_number', 'text, integer, integer');
  IF canon IS NULL THEN
    RETURN;
  END IF;

  ident := pg_temp.v3_ident(canon);
  PERFORM pg_temp.v3_harden_grants('format_document_number', ident);
  UPDATE _v3_actions
    SET detail = 'search_path=public + REVOKE PUBLIC/anon + GRANT authenticated/service_role (body unchanged)'
    WHERE proname = 'format_document_number' AND kind = 'canonical';
END $$;

-- ─── Audit notices ───────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  RAISE NOTICE '==== v3 hardening action log ====';
  FOR r IN
    SELECT proname, identity_args, typelist, kind, detail
    FROM _v3_actions
    ORDER BY proname, kind, identity_args
  LOOP
    RAISE NOTICE '% | (%) typelist=[%] | % | %',
      r.proname, r.identity_args, r.typelist, r.kind, r.detail;
  END LOOP;
END $$;
