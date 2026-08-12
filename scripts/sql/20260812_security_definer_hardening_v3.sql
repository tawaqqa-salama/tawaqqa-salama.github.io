-- ============================================================================
-- 20260812 — SECURITY DEFINER hardening v3 (overload-safe)
-- ============================================================================
-- Supersedes v2 for execution. Fixes P0: v2 assumed signatures after
-- checking proname only, which could leave older SECURITY DEFINER overloads
-- executable.
--
-- Rules:
--   • Enumerate ALL overloads via pg_proc + oidvectortypes(proargtypes)
--   • Harden ONLY the canonical type-list used by the application
--   • Unexpected overloads: REVOKE from PUBLIC/anon/authenticated (no DROP)
--   • Never CREATE a new overload when a non-matching overload already exists
--   • Tenant link: auth.uid() → public.users.company_id (no tenant_memberships)
--   • role_code only (never users.role)
--   • No SBC/NFPA / unrelated RLS changes
--
-- Safe to re-run. Do not execute until overload audit is reviewed.
-- ============================================================================

-- ─── 0) Preconditions ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'v3 hardening aborted: public.users does not exist';
  END IF;
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'v3 hardening aborted: public.clients does not exist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'auth_user_id'
  ) THEN
    RAISE EXCEPTION 'v3 hardening aborted: public.users.auth_user_id missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'v3 hardening aborted: public.users.company_id missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'v3 hardening aborted: public.clients.company_id missing';
  END IF;
END $$;

-- ─── Shared: revoke unexpected overloads; return whether canonical exists ────
-- Uses a temp table to report actions (visible in notices).

CREATE TEMP TABLE IF NOT EXISTS _v3_overload_audit (
  proname text NOT NULL,
  identity_args text NOT NULL,
  typelist text NOT NULL,
  classification text NOT NULL, -- canonical | obsolete | missing
  action text NOT NULL
) ON COMMIT DROP;

TRUNCATE _v3_overload_audit;

CREATE OR REPLACE FUNCTION pg_temp.v3_revoke_roles(p_proname text, p_ident text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', p_proname, p_ident);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', p_proname, p_ident);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', p_proname, p_ident);
  -- Keep service_role for break-glass / backend only
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
    p_proname,
    p_ident
  );
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'v3: could not revoke public.%(%) — skipped', p_proname, p_ident;
  WHEN undefined_object THEN
    RAISE NOTICE 'v3: could not revoke public.%(%) — skipped', p_proname, p_ident;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.v3_grant_auth(p_proname text, p_ident text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', p_proname, p_ident);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', p_proname, p_ident);
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
    p_proname,
    p_ident
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.v3_lock_search_path(p_proname text, p_ident text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    'ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public',
    p_proname,
    p_ident
  );
END;
$$;

-- Classify every overload for a name against a canonical type list.
-- Returns true if a canonical overload exists.
CREATE OR REPLACE FUNCTION pg_temp.v3_classify_overloads(
  p_proname text,
  p_canonical_typelist text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  found boolean := false;
  n int := 0;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      COALESCE(pg_get_function_identity_arguments(p.oid), '') AS ident,
      COALESCE(oidvectortypes(p.proargtypes), '') AS typelist
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = p_proname
  LOOP
    n := n + 1;
    IF r.typelist = p_canonical_typelist THEN
      found := true;
      INSERT INTO _v3_overload_audit(proname, identity_args, typelist, classification, action)
      VALUES (p_proname, r.ident, r.typelist, 'canonical', 'harden this signature');
    ELSE
      PERFORM pg_temp.v3_revoke_roles(p_proname, r.ident);
      INSERT INTO _v3_overload_audit(proname, identity_args, typelist, classification, action)
      VALUES (
        p_proname,
        r.ident,
        r.typelist,
        'obsolete',
        'REVOKE PUBLIC/anon/authenticated; GRANT service_role only'
      );
      RAISE NOTICE 'v3: obsolete overload revoked: %(%) typelist=[%]',
        p_proname, r.ident, r.typelist;
    END IF;
  END LOOP;

  IF n = 0 THEN
    INSERT INTO _v3_overload_audit(proname, identity_args, typelist, classification, action)
    VALUES (p_proname, '', p_canonical_typelist, 'missing', 'skip — function not present');
  ELSIF NOT found THEN
    INSERT INTO _v3_overload_audit(proname, identity_args, typelist, classification, action)
    VALUES (
      p_proname,
      '',
      p_canonical_typelist,
      'missing',
      'canonical signature absent — NOT creating new overload'
    );
    RAISE NOTICE
      'v3: % has overloads but none match canonical typelist [%] — body rewrite skipped',
      p_proname, p_canonical_typelist;
  END IF;

  RETURN found;
END;
$$;

-- Resolve identity_args string for the canonical typelist (exact existing overload).
CREATE OR REPLACE FUNCTION pg_temp.v3_canonical_ident(
  p_proname text,
  p_canonical_typelist text
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(pg_get_function_identity_arguments(p.oid), '')
  FROM pg_proc p
  JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
  WHERE nsp.nspname = 'public'
    AND p.proname = p_proname
    AND COALESCE(oidvectortypes(p.proargtypes), '') = p_canonical_typelist
  ORDER BY p.oid
  LIMIT 1;
$$;

-- ─── 1) Tenant helpers (0-arg) — enumerate overloads ─────────────────────────

DO $$
DECLARE
  found boolean;
  ident text;
  any_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_app_company_id'
  ) INTO any_exists;

  found := pg_temp.v3_classify_overloads('current_app_company_id', '');

  -- Harden 0-arg form only when it exists, or create it when no overload exists at all.
  -- Never create 0-arg if only non-canonical overloads are present.
  IF found OR NOT any_exists THEN
    CREATE OR REPLACE FUNCTION public.current_app_company_id()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $f$
      SELECT u.company_id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.deleted_at IS NULL
        AND COALESCE(u.is_active, true) = true
      LIMIT 1;
    $f$;
    ident := COALESCE(pg_temp.v3_canonical_ident('current_app_company_id', ''), '');
    PERFORM pg_temp.v3_grant_auth('current_app_company_id', ident);
    UPDATE _v3_overload_audit
      SET action = 'CREATE OR REPLACE + revoke anon + grant authenticated/service_role'
      WHERE proname = 'current_app_company_id'
        AND classification IN ('canonical', 'missing');
  END IF;
END $$;

COMMENT ON FUNCTION public.current_app_company_id() IS
  'v3: auth.uid() → public.users.company_id (no memberships); overload-safe';

DO $$
DECLARE
  found boolean;
  ident text;
BEGIN
  found := pg_temp.v3_classify_overloads('current_app_user_id', '');
  IF found THEN
    CREATE OR REPLACE FUNCTION public.current_app_user_id()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $f$
      SELECT u.id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.deleted_at IS NULL
      LIMIT 1;
    $f$;
    ident := pg_temp.v3_canonical_ident('current_app_user_id', '');
    PERFORM pg_temp.v3_grant_auth('current_app_user_id', ident);
    UPDATE _v3_overload_audit
      SET action = 'CREATE OR REPLACE + revoke anon + grant authenticated/service_role'
      WHERE proname = 'current_app_user_id' AND classification = 'canonical';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_app_user_id'
  ) THEN
    -- Helper absent: safe to create the single 0-arg form (no competing overload)
    CREATE OR REPLACE FUNCTION public.current_app_user_id()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $f$
      SELECT u.id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.deleted_at IS NULL
      LIMIT 1;
    $f$;
    PERFORM pg_temp.v3_grant_auth('current_app_user_id', '');
    INSERT INTO _v3_overload_audit(proname, identity_args, typelist, classification, action)
    VALUES ('current_app_user_id', '', '', 'canonical', 'created 0-arg helper (was missing)');
  END IF;
END $$;

DO $$
DECLARE
  found boolean;
  ident text;
  has_flag boolean;
BEGIN
  found := pg_temp.v3_classify_overloads('is_platform_admin', '');
  has_flag := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_platform_admin'
  );

  IF found OR NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin'
  ) THEN
    IF has_flag THEN
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
    ident := COALESCE(pg_temp.v3_canonical_ident('is_platform_admin', ''), '');
    PERFORM pg_temp.v3_grant_auth('is_platform_admin', ident);
    UPDATE _v3_overload_audit
      SET action = 'CREATE OR REPLACE + revoke anon + grant authenticated/service_role'
      WHERE proname = 'is_platform_admin' AND classification IN ('canonical', 'missing');
  END IF;
END $$;

-- assert_client_tenant_access(uuid) — create only if no conflicting non-uuid overload blocks us
DO $$
DECLARE
  found boolean;
  ident text;
  any_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'assert_client_tenant_access'
  ) INTO any_exists;

  found := pg_temp.v3_classify_overloads('assert_client_tenant_access', 'uuid');

  IF found OR NOT any_exists THEN
    CREATE OR REPLACE FUNCTION public.assert_client_tenant_access(p_client_id uuid)
    RETURNS void
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $f$
    BEGIN
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
        SELECT 1 FROM public.clients c
        WHERE c.id = p_client_id
          AND c.company_id = public.current_app_company_id()
      ) THEN
        RAISE EXCEPTION 'tenant_isolation: client not in your company';
      END IF;
    END;
    $f$;
    ident := COALESCE(pg_temp.v3_canonical_ident('assert_client_tenant_access', 'uuid'), 'p_client_id uuid');
    PERFORM pg_temp.v3_grant_auth('assert_client_tenant_access', ident);
    UPDATE _v3_overload_audit
      SET action = 'CREATE OR REPLACE + revoke anon + grant authenticated/service_role'
      WHERE proname = 'assert_client_tenant_access'
        AND classification IN ('canonical', 'missing');
  END IF;
END $$;

-- ─── 2) Client-scoped DEFINER RPCs — harden exact canonical overloads only ───

-- save_project_engineering_live(uuid, jsonb, text)
DO $$
DECLARE
  found boolean;
  ident text;
BEGIN
  found := pg_temp.v3_classify_overloads('save_project_engineering_live', 'uuid, jsonb, text');
  IF NOT found THEN
    RETURN;
  END IF;
  IF to_regclass('public.project_engineering_live') IS NULL THEN
    ident := pg_temp.v3_canonical_ident('save_project_engineering_live', 'uuid, jsonb, text');
    PERFORM pg_temp.v3_lock_search_path('save_project_engineering_live', ident);
    PERFORM pg_temp.v3_grant_auth('save_project_engineering_live', ident);
    UPDATE _v3_overload_audit SET action = 'grants+search_path only (live table missing)'
      WHERE proname = 'save_project_engineering_live' AND classification = 'canonical';
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

  ident := pg_temp.v3_canonical_ident('save_project_engineering_live', 'uuid, jsonb, text');
  PERFORM pg_temp.v3_grant_auth('save_project_engineering_live', ident);
  UPDATE _v3_overload_audit
    SET action = 'CREATE OR REPLACE canonical + revoke anon + grant authenticated/service_role'
    WHERE proname = 'save_project_engineering_live' AND classification = 'canonical';
END $$;

-- save_stage4_live_bundle(uuid, jsonb, jsonb, jsonb, text)
DO $$
DECLARE
  found boolean;
  ident text;
BEGIN
  found := pg_temp.v3_classify_overloads('save_stage4_live_bundle', 'uuid, jsonb, jsonb, jsonb, text');
  IF NOT found THEN
    RETURN;
  END IF;
  IF to_regclass('public.project_stage4_live') IS NULL THEN
    ident := pg_temp.v3_canonical_ident('save_stage4_live_bundle', 'uuid, jsonb, jsonb, jsonb, text');
    PERFORM pg_temp.v3_lock_search_path('save_stage4_live_bundle', ident);
    PERFORM pg_temp.v3_grant_auth('save_stage4_live_bundle', ident);
    UPDATE _v3_overload_audit SET action = 'grants+search_path only (stage4 table missing)'
      WHERE proname = 'save_stage4_live_bundle' AND classification = 'canonical';
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

  ident := pg_temp.v3_canonical_ident('save_stage4_live_bundle', 'uuid, jsonb, jsonb, jsonb, text');
  PERFORM pg_temp.v3_grant_auth('save_stage4_live_bundle', ident);
  UPDATE _v3_overload_audit
    SET action = 'CREATE OR REPLACE canonical + revoke anon + grant authenticated/service_role'
    WHERE proname = 'save_stage4_live_bundle' AND classification = 'canonical';
END $$;

-- save_stage5_live_bundle(uuid, jsonb, jsonb, jsonb, text)
DO $$
DECLARE
  found boolean;
  ident text;
  can_rewrite boolean;
BEGIN
  found := pg_temp.v3_classify_overloads('save_stage5_live_bundle', 'uuid, jsonb, jsonb, jsonb, text');
  IF NOT found THEN
    RETURN;
  END IF;

  ident := pg_temp.v3_canonical_ident('save_stage5_live_bundle', 'uuid, jsonb, jsonb, jsonb, text');

  can_rewrite :=
    to_regclass('public.field_visit_reports') IS NOT NULL
    AND to_regclass('public.report_items') IS NOT NULL
    AND to_regclass('public.report_pdf_snapshots') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'project_supervision_reports'
        AND column_name = 'live_payload'
    );

  IF NOT can_rewrite THEN
    PERFORM pg_temp.v3_lock_search_path('save_stage5_live_bundle', ident);
    PERFORM pg_temp.v3_grant_auth('save_stage5_live_bundle', ident);
    UPDATE _v3_overload_audit
      SET action = 'grants+search_path only (stage5 supporting columns/tables incomplete)'
      WHERE proname = 'save_stage5_live_bundle' AND classification = 'canonical';
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

  ident := pg_temp.v3_canonical_ident('save_stage5_live_bundle', 'uuid, jsonb, jsonb, jsonb, text');
  PERFORM pg_temp.v3_grant_auth('save_stage5_live_bundle', ident);
  UPDATE _v3_overload_audit
    SET action = 'CREATE OR REPLACE canonical + revoke anon + grant authenticated/service_role'
    WHERE proname = 'save_stage5_live_bundle' AND classification = 'canonical';
END $$;

-- merge_project_engineering_patch(uuid, jsonb, text)
DO $$
DECLARE
  found boolean;
  ident text;
BEGIN
  found := pg_temp.v3_classify_overloads('merge_project_engineering_patch', 'uuid, jsonb, text');
  IF NOT found THEN RETURN; END IF;

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

  ident := pg_temp.v3_canonical_ident('merge_project_engineering_patch', 'uuid, jsonb, text');
  PERFORM pg_temp.v3_grant_auth('merge_project_engineering_patch', ident);
  UPDATE _v3_overload_audit
    SET action = 'CREATE OR REPLACE canonical + revoke anon + grant authenticated/service_role'
    WHERE proname = 'merge_project_engineering_patch' AND classification = 'canonical';
END $$;

-- merge_supervision_report_json(uuid, jsonb, text)
DO $$
DECLARE
  found boolean;
  ident text;
BEGIN
  found := pg_temp.v3_classify_overloads('merge_supervision_report_json', 'uuid, jsonb, text');
  IF NOT found THEN RETURN; END IF;

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

  ident := pg_temp.v3_canonical_ident('merge_supervision_report_json', 'uuid, jsonb, text');
  PERFORM pg_temp.v3_grant_auth('merge_supervision_report_json', ident);
  UPDATE _v3_overload_audit
    SET action = 'CREATE OR REPLACE canonical + revoke anon + grant authenticated/service_role'
    WHERE proname = 'merge_supervision_report_json' AND classification = 'canonical';
END $$;

-- save_project_engineering_data(uuid, jsonb, text)
DO $$
DECLARE
  found boolean;
  ident text;
BEGIN
  found := pg_temp.v3_classify_overloads('save_project_engineering_data', 'uuid, jsonb, text');
  IF NOT found THEN RETURN; END IF;

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

  ident := pg_temp.v3_canonical_ident('save_project_engineering_data', 'uuid, jsonb, text');
  PERFORM pg_temp.v3_grant_auth('save_project_engineering_data', ident);
  UPDATE _v3_overload_audit
    SET action = 'CREATE OR REPLACE canonical + revoke anon + grant authenticated/service_role'
    WHERE proname = 'save_project_engineering_data' AND classification = 'canonical';
END $$;

-- slim_project_engineering_data_urls(uuid)
DO $$
DECLARE
  found boolean;
  ident text;
BEGIN
  found := pg_temp.v3_classify_overloads('slim_project_engineering_data_urls', 'uuid');
  IF NOT found THEN RETURN; END IF;

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
      NULL;
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

  ident := pg_temp.v3_canonical_ident('slim_project_engineering_data_urls', 'uuid');
  PERFORM pg_temp.v3_grant_auth('slim_project_engineering_data_urls', ident);
  UPDATE _v3_overload_audit
    SET action = 'CREATE OR REPLACE canonical + revoke anon + grant authenticated/service_role'
    WHERE proname = 'slim_project_engineering_data_urls' AND classification = 'canonical';
END $$;

-- next_document_number(text, uuid)
DO $$
DECLARE
  found boolean;
  ident text;
BEGIN
  found := pg_temp.v3_classify_overloads('next_document_number', 'text, uuid');
  IF NOT found THEN RETURN; END IF;

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

  ident := pg_temp.v3_canonical_ident('next_document_number', 'text, uuid');
  PERFORM pg_temp.v3_grant_auth('next_document_number', ident);
  UPDATE _v3_overload_audit
    SET action = 'CREATE OR REPLACE canonical + revoke anon + grant authenticated/service_role'
    WHERE proname = 'next_document_number' AND classification = 'canonical';
END $$;

-- format_document_number(text, integer, integer) — IMMUTABLE; grants only on exact overload
DO $$
DECLARE
  found boolean;
  ident text;
BEGIN
  found := pg_temp.v3_classify_overloads('format_document_number', 'text, integer, integer');
  IF NOT found THEN RETURN; END IF;
  ident := pg_temp.v3_canonical_ident('format_document_number', 'text, integer, integer');
  PERFORM pg_temp.v3_grant_auth('format_document_number', ident);
  UPDATE _v3_overload_audit
    SET action = 'revoke anon/PUBLIC + grant authenticated/service_role (no body change)'
    WHERE proname = 'format_document_number' AND classification = 'canonical';
END $$;

-- ─── 3) Optional role helpers (042–044): lock every existing overload ─────────
DO $$
DECLARE
  r record;
  names text[] := ARRAY[
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
  ];
  nm text;
BEGIN
  FOREACH nm IN ARRAY names LOOP
    FOR r IN
      SELECT
        COALESCE(pg_get_function_identity_arguments(p.oid), '') AS ident,
        COALESCE(oidvectortypes(p.proargtypes), '') AS typelist
      FROM pg_proc p
      JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
      WHERE nsp.nspname = 'public'
        AND p.proname = nm
        AND p.prosecdef = true
    LOOP
      PERFORM pg_temp.v3_lock_search_path(nm, r.ident);
      PERFORM pg_temp.v3_grant_auth(nm, r.ident);
      INSERT INTO _v3_overload_audit(proname, identity_args, typelist, classification, action)
      VALUES (nm, r.ident, r.typelist, 'canonical', 'search_path + revoke anon + grant authenticated/service_role');
    END LOOP;
  END LOOP;
END $$;

-- ─── 4) Emit audit summary as notices (visible in SQL editor) ────────────────
DO $$
DECLARE
  r record;
BEGIN
  RAISE NOTICE '==== v3 overload audit summary ====';
  FOR r IN
    SELECT proname, identity_args, typelist, classification, action
    FROM _v3_overload_audit
    ORDER BY proname, classification, identity_args
  LOOP
    RAISE NOTICE '% | [%] typelist=[%] | % | %',
      r.proname, r.identity_args, r.typelist, r.classification, r.action;
  END LOOP;
END $$;
