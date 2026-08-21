-- ============================================================================
-- Phase 5A: dedicated engineering-workflow transition RPC
--
-- This migration deliberately keeps clients.pipeline_stage as the business
-- pipeline only. It adds no tables, columns, policies, Storage changes, or
-- data backfill. The function is least-permissive: it validates the trusted
-- persisted engineering state before transitioning only to stages used by the
-- currently server-protected boundary (technical report -> visits, visits ->
-- transmittals).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.transition_project_engineering_stage(
  p_client_id uuid,
  p_target_stage text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_target text := lower(trim(COALESCE(p_target_stage, '')));
  v_technical_status text;
  v_supervision_status text;
  v_notes_status text;
  v_visit_count integer := 0;
  v_unapproved_visits integer := 0;
  v_open_critical integer := 0;
  v_open_high integer := 0;
  v_blockers jsonb := '[]'::jsonb;
  v_now timestamptz := now();
  v_approved_visits jsonb;
  v_workflow jsonb;
BEGIN
  -- Reuse the hardened platform convention: active authenticated actor,
  -- super-admin exception, and client/company tenant isolation.
  PERFORM public.assert_client_tenant_access(p_client_id);

  IF v_target NOT IN ('supervision_visits', 'transmittals') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WORKFLOW_STAGE_BLOCKED',
      DETAIL = jsonb_build_array('INVALID_STAGE_TRANSITION')::text;
  END IF;

  SELECT payload
    INTO v_payload
  FROM public.project_engineering_live
  WHERE client_id = p_client_id
  FOR UPDATE;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WORKFLOW_STAGE_BLOCKED',
      DETAIL = jsonb_build_array('PREVIOUS_STAGE_NOT_APPROVED')::text;
  END IF;

  v_technical_status := COALESCE(v_payload #>> '{technical_report,status}', '');

  -- Stage 4 -> Stage 5: a technical report must be complete or approved.
  IF v_target = 'supervision_visits' THEN
    IF v_technical_status NOT IN ('مكتمل', 'معتمد') THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WORKFLOW_STAGE_BLOCKED',
        DETAIL = jsonb_build_array('PREVIOUS_STAGE_NOT_APPROVED')::text;
    END IF;

    v_workflow := jsonb_set(
      COALESCE(v_payload->'workflow', '{}'::jsonb),
      '{active_stage}',
      to_jsonb('supervision_visits'::text),
      true
    );
    v_payload := jsonb_set(v_payload, '{workflow}', v_workflow, true);

    UPDATE public.project_engineering_live
    SET payload = v_payload, updated_at = v_now
    WHERE client_id = p_client_id;

    RETURN jsonb_build_object('ok', true, 'target_stage', v_target);
  END IF;

  -- Stage 5 -> Stage 6: read the canonical persisted live payload, never a
  -- browser-supplied state. Stage-5 relational rows are mirrors/indexes only.
  IF v_technical_status NOT IN ('مكتمل', 'معتمد') THEN
    v_blockers := v_blockers || jsonb_build_array('PREVIOUS_STAGE_NOT_APPROVED');
  END IF;

  SELECT count(*)
    INTO v_visit_count
  FROM jsonb_array_elements(COALESCE(v_payload->'field_visits', '[]'::jsonb)) AS v(value);

  IF v_visit_count = 0 THEN
    v_blockers := v_blockers || jsonb_build_array('NO_FIELD_VISITS');
  ELSE
    SELECT count(*)
      INTO v_unapproved_visits
    FROM jsonb_array_elements(COALESCE(v_payload->'field_visits', '[]'::jsonb)) AS v(value)
    WHERE COALESCE(v.value->>'status', '') NOT IN ('مكتمل', 'معتمد');
    IF v_unapproved_visits > 0 THEN
      v_blockers := v_blockers || jsonb_build_array('FIELD_VISIT_NOT_APPROVED');
    END IF;
  END IF;

  v_supervision_status := COALESCE(v_payload #>> '{supervision_report,status}', '');
  IF v_supervision_status NOT IN ('مكتمل', 'معتمد') THEN
    v_blockers := v_blockers || jsonb_build_array('SUPERVISION_NOT_APPROVED');
  END IF;

  v_notes_status := COALESCE(v_payload #>> '{technical_notes,status}', '');
  IF v_notes_status NOT IN ('مكتمل', 'معتمد') THEN
    v_blockers := v_blockers || jsonb_build_array('TECHNICAL_NOTES_NOT_APPROVED');
  END IF;

  SELECT count(*)
    INTO v_open_critical
  FROM jsonb_array_elements(COALESCE(v_payload #> '{technical_notes,deficiencies}', '[]'::jsonb)) AS d(value)
  WHERE COALESCE(d.value->>'resolved', 'false') <> 'true'
    AND COALESCE(d.value->>'severity', '') ~* 'critical|حرج';
  IF v_open_critical > 0 THEN
    v_blockers := v_blockers || jsonb_build_array('OPEN_CRITICAL_DEFICIENCY');
  END IF;

  SELECT count(*)
    INTO v_open_high
  FROM jsonb_array_elements(COALESCE(v_payload #> '{technical_notes,deficiencies}', '[]'::jsonb)) AS d(value)
  WHERE COALESCE(d.value->>'resolved', 'false') <> 'true'
    AND COALESCE(d.value->>'severity', '') ~* 'high|عالي';
  IF v_open_high > 0 THEN
    v_blockers := v_blockers || jsonb_build_array('OPEN_HIGH_DEFICIENCY');
  END IF;

  IF jsonb_array_length(v_blockers) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WORKFLOW_STAGE_BLOCKED',
      DETAIL = v_blockers::text;
  END IF;

  -- Atomically record server-approved Stage 5 and unlock Stage 6. No business
  -- pipeline column is read or written by this RPC.
  SELECT COALESCE(
    jsonb_agg(jsonb_set(v.value, '{status}', to_jsonb('معتمد'::text), true) ORDER BY v.ordinality),
    '[]'::jsonb
  )
    INTO v_approved_visits
  FROM jsonb_array_elements(COALESCE(v_payload->'field_visits', '[]'::jsonb)) WITH ORDINALITY AS v(value, ordinality);

  -- Keep relational Stage-5 mirrors in sync when they already exist; the
  -- canonical transition decision above intentionally does not depend on them.
  UPDATE public.field_visit_reports
  SET payload = jsonb_set(payload, '{status}', to_jsonb('معتمد'::text), true),
      updated_at = v_now
  WHERE client_id = p_client_id;

  UPDATE public.project_supervision_reports
  SET status = 'معتمد',
      live_payload = jsonb_set(COALESCE(live_payload, '{}'::jsonb), '{status}', to_jsonb('معتمد'::text), true),
      updated_at = v_now
  WHERE client_id = p_client_id;

  v_payload := jsonb_set(v_payload, '{field_visits}', v_approved_visits, true);
  v_payload := jsonb_set(v_payload, '{supervision_report}', jsonb_set(COALESCE(v_payload->'supervision_report', '{}'::jsonb), '{status}', to_jsonb('معتمد'::text), true), true);
  v_payload := jsonb_set(v_payload, '{technical_notes}', jsonb_set(COALESCE(v_payload->'technical_notes', '{}'::jsonb), '{status}', to_jsonb('معتمد'::text), true), true);
  v_workflow := COALESCE(v_payload->'workflow', '{}'::jsonb);
  v_workflow := jsonb_set(v_workflow, '{active_stage}', to_jsonb('transmittals'::text), true);
  v_workflow := jsonb_set(v_workflow, '{last_approved_stage}', to_jsonb('visits_supervision'::text), true);
  v_workflow := jsonb_set(
    v_workflow,
    '{approved_at}',
    jsonb_set(COALESCE(v_workflow->'approved_at', '{}'::jsonb), '{visits_supervision}', to_jsonb(v_now::text), true),
    true
  );
  v_payload := jsonb_set(v_payload, '{workflow}', v_workflow, true);

  UPDATE public.project_engineering_live
  SET payload = v_payload, updated_at = v_now
  WHERE client_id = p_client_id;

  RETURN jsonb_build_object('ok', true, 'target_stage', v_target);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_project_engineering_stage(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_project_engineering_stage(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.transition_project_engineering_stage(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.transition_project_engineering_stage(uuid, text) IS
  'Phase 5A: server-authoritative engineering workflow transition; clients.pipeline_stage remains business-only.';

COMMIT;
