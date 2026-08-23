-- ============================================================================
-- Stage 6B-3D1: server-side subordinate approval orchestration
--
-- Purpose:
--   * Keep Migration 055 as the exclusive Stage 6 -> Stage 7 authority.
--   * Lock a reviewed canonical Stage 6 snapshot and its two outgoing singleton
--     projections in a deterministic order.
--   * Invoke 055 inside the same transaction, then make relational projections
--     approved only after the canonical authority succeeds.
--
-- Explicitly excluded:
--   * Any change to 055, 059, or 060.
--   * UI, approved forms, PDF/templates, Storage, RLS, backfill, repair,
--     automatic adoption, Production application, merge, or deploy.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project_correspondences') IS NULL
    OR to_regclass('public.project_engineering_live') IS NULL
    OR to_regclass('public.primary_engineering_project_mappings') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-3D1 requires 056, 058, 059, and project_engineering_live';
  END IF;

  IF to_regprocedure('public.app_role_in(text[])') IS NULL
    OR to_regprocedure('public.transition_project_engineering_stage(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-3D1 requires app_role_in and Migration 055';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.approve_stage6_documents_and_transition(
  p_client_id uuid,
  p_project_id uuid,
  p_expected_canonical_updated_at timestamptz,
  p_expected_engineering_delivery_lock_version integer DEFAULT NULL,
  p_expected_cd_cover_letter_lock_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_mapped_project_id uuid;
  v_live public.project_engineering_live%ROWTYPE;
  v_engineering_delivery jsonb;
  v_cd_cover_letter jsonb;
  v_engineering_delivery_row public.project_correspondences%ROWTYPE;
  v_cd_cover_letter_row public.project_correspondences%ROWTYPE;
  v_locked_row public.project_correspondences%ROWTYPE;
  v_engineering_delivery_count integer := 0;
  v_cd_cover_letter_count integer := 0;
  v_transition jsonb;
  v_transition_detail text;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  -- Use exactly the existing server-side projects.edit-equivalent role set from
  -- 060. Tenant membership alone is deliberately not enough for approval.
  IF NOT public.app_role_in(ARRAY['super_admin', 'tenant_admin', 'admin', 'manager', 'engineer']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_PERMISSION_DENIED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  -- Fail closed before mapping resolution so no cross-tenant client existence is
  -- exposed to a caller. Platform administrators retain the existing platform
  -- exception used by 060.
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients AS c
    WHERE c.id = p_client_id
      AND (public.is_platform_admin() OR c.company_id = v_company_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  SELECT m.project_id
    INTO v_mapped_project_id
  FROM public.primary_engineering_project_mappings AS m
  JOIN public.projects AS p
    ON p.id = m.project_id
   AND p.client_id = m.client_id
  WHERE m.client_id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROJECT_IDENTITY_UNAVAILABLE';
  END IF;

  IF v_mapped_project_id IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLIENT_MISMATCH';
  END IF;

  IF p_expected_canonical_updated_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANONICAL_STALE_REVISION';
  END IF;

  -- Lock order is fixed and matches 060: canonical first, then outgoing
  -- engineering_delivery, then outgoing cd_cover_letter.
  SELECT pel.*
    INTO v_live
  FROM public.project_engineering_live AS pel
  WHERE pel.client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANONICAL_ENGINEERING_STATE_REQUIRED';
  END IF;

  IF v_live.updated_at IS DISTINCT FROM p_expected_canonical_updated_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANONICAL_STALE_REVISION';
  END IF;

  IF COALESCE(v_live.payload #>> '{workflow,active_stage}', '') <> 'transmittals' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'WORKFLOW_STATE_CONFLICT';
  END IF;

  v_engineering_delivery := v_live.payload -> 'engineering_delivery';
  v_cd_cover_letter := v_live.payload -> 'cd_cover_letter';

  -- Lock and count every matching outgoing row defensively. 059's partial
  -- unique invariant should keep each count at 0 or 1; any higher count is a
  -- fail-closed singleton conflict rather than an implicit repair.
  FOR v_locked_row IN
    SELECT pc.*
    FROM public.project_correspondences AS pc
    WHERE pc.project_id = v_mapped_project_id
      AND pc.client_id = p_client_id
      AND pc.correspondence_type = 'engineering_delivery'
      AND pc.direction = 'outgoing'
    ORDER BY pc.id
    FOR UPDATE
  LOOP
    v_engineering_delivery_count := v_engineering_delivery_count + 1;
    v_engineering_delivery_row := v_locked_row;
  END LOOP;

  IF v_engineering_delivery_count > 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_SINGLETON_CONFLICT';
  END IF;

  FOR v_locked_row IN
    SELECT pc.*
    FROM public.project_correspondences AS pc
    WHERE pc.project_id = v_mapped_project_id
      AND pc.client_id = p_client_id
      AND pc.correspondence_type = 'cd_cover_letter'
      AND pc.direction = 'outgoing'
    ORDER BY pc.id
    FOR UPDATE
  LOOP
    v_cd_cover_letter_count := v_cd_cover_letter_count + 1;
    v_cd_cover_letter_row := v_locked_row;
  END LOOP;

  IF v_cd_cover_letter_count > 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_SINGLETON_CONFLICT';
  END IF;

  IF v_engineering_delivery_count = 0 THEN
    IF p_expected_engineering_delivery_lock_version IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
    END IF;
  ELSE
    IF p_expected_engineering_delivery_lock_version IS NULL
      OR v_engineering_delivery_row.lock_version <> p_expected_engineering_delivery_lock_version THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
    END IF;

    IF v_engineering_delivery_row.document_status = 'approved'
      OR v_engineering_delivery_row.document_status <> 'ready' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STATE_DIVERGENCE';
    END IF;
  END IF;

  IF v_cd_cover_letter_count = 0 THEN
    IF p_expected_cd_cover_letter_lock_version IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
    END IF;
  ELSE
    IF p_expected_cd_cover_letter_lock_version IS NULL
      OR v_cd_cover_letter_row.lock_version <> p_expected_cd_cover_letter_lock_version THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
    END IF;

    IF v_cd_cover_letter_row.document_status = 'approved'
      OR v_cd_cover_letter_row.document_status <> 'ready' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STATE_DIVERGENCE';
    END IF;
  END IF;

  -- 055 remains the only authority that validates the canonical documents,
  -- changes their statuses to معتمد, and unlocks final_report. This function
  -- neither accepts nor writes a workflow state itself.
  BEGIN
    v_transition := public.transition_project_engineering_stage(p_client_id, 'final_report');
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS v_transition_detail = PG_EXCEPTION_DETAIL;
      IF SQLERRM = 'WORKFLOW_STAGE_BLOCKED' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'STAGE6_APPROVAL_BLOCKED',
          DETAIL = v_transition_detail;
      END IF;
      RAISE;
  END;

  IF COALESCE((v_transition ->> 'ok')::boolean, false) IS NOT TRUE
    OR v_transition ->> 'target_stage' IS DISTINCT FROM 'final_report' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAGE6_APPROVAL_BLOCKED';
  END IF;

  -- The following projection writes occur only after 055 has succeeded. Since
  -- PL/pgSQL executes inside one caller transaction, any later constraint,
  -- singleton, or optimistic-lock failure rolls the 055 transition back too.
  IF v_engineering_delivery_count = 0 THEN
    INSERT INTO public.project_correspondences (
      project_id, client_id, correspondence_type, direction, subject,
      reference_number, correspondence_date, body, recipient_name,
      responsible_engineer_name, responsible_manager_name, document_status,
      lock_version, approved_at, created_at, updated_at
    ) VALUES (
      v_mapped_project_id, p_client_id, 'engineering_delivery', 'outgoing',
      'خطاب تسليم دراسة السلامة',
      NULLIF(trim(v_engineering_delivery ->> 'outgoing_number'), ''),
      NULLIF(v_engineering_delivery ->> 'delivery_date', '')::date,
      COALESCE(NULLIF(trim(v_engineering_delivery ->> 'notes'), ''), NULLIF(trim(v_engineering_delivery ->> 'study_summary'), '')),
      NULLIF(trim(v_engineering_delivery ->> 'delivered_to'), ''),
      NULLIF(trim(v_engineering_delivery ->> 'safety_engineer_name'), ''),
      NULLIF(trim(v_engineering_delivery ->> 'manager_name'), ''),
      'approved', 0, v_now, v_now, v_now
    )
    ON CONFLICT (project_id, correspondence_type)
      WHERE direction = 'outgoing'
        AND correspondence_type IN ('engineering_delivery', 'cd_cover_letter')
    DO NOTHING
    RETURNING * INTO v_engineering_delivery_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_SINGLETON_CONFLICT';
    END IF;
  ELSE
    UPDATE public.project_correspondences
    SET subject = 'خطاب تسليم دراسة السلامة',
        reference_number = NULLIF(trim(v_engineering_delivery ->> 'outgoing_number'), ''),
        correspondence_date = NULLIF(v_engineering_delivery ->> 'delivery_date', '')::date,
        body = COALESCE(NULLIF(trim(v_engineering_delivery ->> 'notes'), ''), NULLIF(trim(v_engineering_delivery ->> 'study_summary'), '')),
        recipient_name = NULLIF(trim(v_engineering_delivery ->> 'delivered_to'), ''),
        responsible_engineer_name = NULLIF(trim(v_engineering_delivery ->> 'safety_engineer_name'), ''),
        responsible_manager_name = NULLIF(trim(v_engineering_delivery ->> 'manager_name'), ''),
        document_status = 'approved',
        approved_at = v_now,
        updated_at = v_now,
        lock_version = lock_version + 1
    WHERE id = v_engineering_delivery_row.id
      AND lock_version = p_expected_engineering_delivery_lock_version
    RETURNING * INTO v_engineering_delivery_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
    END IF;
  END IF;

  IF v_cd_cover_letter_count = 0 THEN
    INSERT INTO public.project_correspondences (
      project_id, client_id, correspondence_type, direction, subject,
      reference_number, correspondence_date, body, recipient_name,
      responsible_engineer_name, responsible_manager_name, document_status,
      lock_version, approved_at, created_at, updated_at
    ) VALUES (
      v_mapped_project_id, p_client_id, 'cd_cover_letter', 'outgoing',
      'خطاب تسليم الدفاع المدني',
      NULLIF(trim(v_cd_cover_letter ->> 'outgoing_number'), ''),
      NULLIF(v_cd_cover_letter ->> 'letter_date', '')::date,
      NULL,
      NULLIF(trim(v_cd_cover_letter ->> 'addressee'), ''),
      NULLIF(trim(v_cd_cover_letter ->> 'safety_engineer_name'), ''),
      NULLIF(trim(v_cd_cover_letter ->> 'manager_name'), ''),
      'approved', 0, v_now, v_now, v_now
    )
    ON CONFLICT (project_id, correspondence_type)
      WHERE direction = 'outgoing'
        AND correspondence_type IN ('engineering_delivery', 'cd_cover_letter')
    DO NOTHING
    RETURNING * INTO v_cd_cover_letter_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_SINGLETON_CONFLICT';
    END IF;
  ELSE
    UPDATE public.project_correspondences
    SET subject = 'خطاب تسليم الدفاع المدني',
        reference_number = NULLIF(trim(v_cd_cover_letter ->> 'outgoing_number'), ''),
        correspondence_date = NULLIF(v_cd_cover_letter ->> 'letter_date', '')::date,
        body = NULL,
        recipient_name = NULLIF(trim(v_cd_cover_letter ->> 'addressee'), ''),
        responsible_engineer_name = NULLIF(trim(v_cd_cover_letter ->> 'safety_engineer_name'), ''),
        responsible_manager_name = NULLIF(trim(v_cd_cover_letter ->> 'manager_name'), ''),
        document_status = 'approved',
        approved_at = v_now,
        updated_at = v_now,
        lock_version = lock_version + 1
    WHERE id = v_cd_cover_letter_row.id
      AND lock_version = p_expected_cd_cover_letter_lock_version
    RETURNING * INTO v_cd_cover_letter_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'target_stage', 'final_report',
    'engineering_delivery_lock_version', v_engineering_delivery_row.lock_version,
    'cd_cover_letter_lock_version', v_cd_cover_letter_row.lock_version,
    'approved_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_stage6_documents_and_transition(uuid, uuid, timestamptz, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_stage6_documents_and_transition(uuid, uuid, timestamptz, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_stage6_documents_and_transition(uuid, uuid, timestamptz, integer, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_stage6_documents_and_transition(uuid, uuid, timestamptz, integer, integer) IS
  'Stage 6B-3D1: atomic subordinate correspondence approval orchestration. Migration 055 remains the exclusive Stage 6-to-7 decision and workflow authority.';

COMMIT;
