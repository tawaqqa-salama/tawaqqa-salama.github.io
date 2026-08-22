-- ============================================================================
-- Stage 6A: contract and server-safe Stage 6 -> Stage 7 transition
--
-- This migration replaces only the existing server-authoritative transition
-- function. It adds no tables, columns, policies, Storage changes, backfill, or
-- Business Pipeline mutation. Stage 5/B1 semantics remain intact. Stage 6 facts
-- are read from canonical locked JSONB, never trusted from browser input.
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
  v_company_id uuid;
  v_technical_status text;
  v_supervision_status text;
  v_notes_status text;
  v_visit_count integer := 0;
  v_unapproved_visits integer := 0;
  v_open_critical integer := 0;
  v_open_high integer := 0;
  v_open_critical_field_observation integer := 0;
  v_open_high_field_observation integer := 0;
  v_blockers jsonb := '[]'::jsonb;
  v_now timestamptz := now();
  v_approved_visits jsonb;
  v_workflow jsonb;
  v_engineering_delivery jsonb;
  v_cd_cover_letter jsonb;
BEGIN
  -- Fail closed to the authenticated actor's active company. The client id is
  -- never sufficient on its own, so a cross-tenant or unauthenticated request
  -- is indistinguishable from a missing project.
  v_company_id := public.current_app_company_id();
  IF v_company_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.clients AS c
    WHERE c.id = p_client_id
      AND c.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PROJECT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF v_target NOT IN ('supervision_visits', 'transmittals', 'final_report') THEN
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

  -- Stage 6 -> Stage 7: validate only canonical locked JSONB. This covers
  -- the current two singleton documents and deliberately adds no future
  -- correspondence, recipients, attachments, archive, or lifecycle model.
  IF v_target = 'final_report' THEN
    IF COALESCE(v_payload #>> '{workflow,active_stage}', '') <> 'transmittals' THEN
      v_blockers := v_blockers || jsonb_build_array('STAGE6_NOT_ACTIVE');
    END IF;

    v_engineering_delivery := v_payload->'engineering_delivery';
    IF jsonb_typeof(v_engineering_delivery) IS DISTINCT FROM 'object'
      OR COALESCE(v_engineering_delivery->>'status', '') NOT IN ('مكتمل', 'معتمد')
      OR COALESCE(v_engineering_delivery->>'delivery_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR NULLIF(trim(v_engineering_delivery->>'delivered_to'), '') IS NULL
      OR NULLIF(trim(v_engineering_delivery->>'outgoing_number'), '') IS NULL
      OR NULLIF(trim(v_engineering_delivery->>'safety_engineer_name'), '') IS NULL
      OR NULLIF(trim(v_engineering_delivery->>'manager_name'), '') IS NULL THEN
      v_blockers := v_blockers || jsonb_build_array('STAGE6_ENGINEERING_DELIVERY_INCOMPLETE');
    END IF;

    v_cd_cover_letter := v_payload->'cd_cover_letter';
    IF jsonb_typeof(v_cd_cover_letter) IS DISTINCT FROM 'object'
      OR COALESCE(v_cd_cover_letter->>'status', '') NOT IN ('مكتمل', 'معتمد')
      OR COALESCE(v_cd_cover_letter->>'letter_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR NULLIF(trim(v_cd_cover_letter->>'addressee'), '') IS NULL
      OR NULLIF(trim(v_cd_cover_letter->>'outgoing_number'), '') IS NULL
      OR NULLIF(trim(v_cd_cover_letter->>'safety_engineer_name'), '') IS NULL
      OR NULLIF(trim(v_cd_cover_letter->>'manager_name'), '') IS NULL THEN
      v_blockers := v_blockers || jsonb_build_array('STAGE6_CD_COVER_LETTER_INCOMPLETE');
    END IF;

    IF jsonb_array_length(v_blockers) > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WORKFLOW_STAGE_BLOCKED',
        DETAIL = v_blockers::text;
    END IF;

    v_engineering_delivery := jsonb_set(v_engineering_delivery, '{status}', to_jsonb('معتمد'::text), true);
    v_cd_cover_letter := jsonb_set(v_cd_cover_letter, '{status}', to_jsonb('معتمد'::text), true);
    v_payload := jsonb_set(v_payload, '{engineering_delivery}', v_engineering_delivery, true);
    v_payload := jsonb_set(v_payload, '{cd_cover_letter}', v_cd_cover_letter, true);
    v_workflow := COALESCE(v_payload->'workflow', '{}'::jsonb);
    v_workflow := jsonb_set(v_workflow, '{active_stage}', to_jsonb('final_report'::text), true);
    v_workflow := jsonb_set(v_workflow, '{last_approved_stage}', to_jsonb('transmittals'::text), true);
    v_workflow := jsonb_set(
      v_workflow,
      '{approved_at}',
      jsonb_set(COALESCE(v_workflow->'approved_at', '{}'::jsonb), '{transmittals}', to_jsonb(v_now::text), true),
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

  -- B1: derive explicit remediation cases from canonical structured observations.
  -- A valid edge must point from a later visit to an existing observation in a
  -- prior visit. Severity is assessed across the chain; only the latest valid
  -- follow-up can release the blocker, and only when it is engineer-verified
  -- with a recorded resolution timestamp. Evidence and manual links are not
  -- workflow facts and are intentionally ignored here.
  WITH RECURSIVE observation_rows AS (
    SELECT
      CASE
        WHEN COALESCE(visit.value->>'visit_number', '') ~ '^[1-9][0-9]*$'
          THEN (visit.value->>'visit_number')::integer
        ELSE NULL
      END AS visit_number,
      observation.value->>'id' AS observation_id,
      observation.value AS observation
    FROM jsonb_array_elements(COALESCE(v_payload->'field_visits', '[]'::jsonb)) AS visit(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(visit.value->'observations', '[]'::jsonb)) AS observation(value)
    WHERE COALESCE(visit.value->>'visit_number', '') ~ '^[1-9][0-9]*$'
      AND NULLIF(trim(observation.value->>'id'), '') IS NOT NULL
  ),
  edges AS (
    SELECT
      parent.visit_number AS parent_visit_number,
      parent.observation_id AS parent_observation_id,
      child.visit_number AS child_visit_number,
      child.observation_id AS child_observation_id
    FROM observation_rows AS child
    JOIN observation_rows AS parent
      ON parent.visit_number = CASE
        WHEN COALESCE(child.observation #>> '{follow_up_of,visit_number}', '') ~ '^[1-9][0-9]*$'
          THEN (child.observation #>> '{follow_up_of,visit_number}')::integer
        ELSE NULL
      END
      AND parent.observation_id = child.observation #>> '{follow_up_of,observation_id}'
    WHERE COALESCE(child.observation #>> '{follow_up_of,visit_number}', '') ~ '^[1-9][0-9]*$'
      AND child.visit_number > parent.visit_number
  ),
  roots AS (
    SELECT item.*
    FROM observation_rows AS item
    WHERE NOT EXISTS (
      SELECT 1
      FROM edges
      WHERE child_visit_number = item.visit_number
        AND child_observation_id = item.observation_id
    )
  ),
  remediation_walk AS (
    SELECT
      root.visit_number AS root_visit_number,
      root.observation_id AS root_observation_id,
      root.visit_number,
      root.observation_id,
      root.observation
    FROM roots AS root

    UNION ALL

    SELECT
      walk.root_visit_number,
      walk.root_observation_id,
      child.visit_number,
      child.observation_id,
      child.observation
    FROM remediation_walk AS walk
    JOIN edges
      ON edges.parent_visit_number = walk.visit_number
      AND edges.parent_observation_id = walk.observation_id
    JOIN observation_rows AS child
      ON child.visit_number = edges.child_visit_number
      AND child.observation_id = edges.child_observation_id
  ),
  remediation_cases AS (
    SELECT
      root_visit_number,
      root_observation_id,
      bool_or(COALESCE(observation->>'severity', '') = 'critical') AS has_critical,
      bool_or(COALESCE(observation->>'severity', '') = 'high') AS has_high,
      (array_agg(observation ORDER BY visit_number DESC, observation_id DESC))[1] AS latest_observation
    FROM remediation_walk
    GROUP BY root_visit_number, root_observation_id
  )
  SELECT
    count(*) FILTER (
      WHERE has_critical
        AND NOT (
          COALESCE(latest_observation->>'status', '') = 'verified'
          AND NULLIF(trim(latest_observation->>'resolved_at'), '') IS NOT NULL
        )
    ),
    count(*) FILTER (
      WHERE NOT has_critical
        AND has_high
        AND NOT (
          COALESCE(latest_observation->>'status', '') = 'verified'
          AND NULLIF(trim(latest_observation->>'resolved_at'), '') IS NOT NULL
        )
    )
  INTO v_open_critical_field_observation, v_open_high_field_observation
  FROM remediation_cases;

  IF v_open_critical_field_observation > 0 THEN
    v_blockers := v_blockers || jsonb_build_array('OPEN_CRITICAL_FIELD_OBSERVATION');
  END IF;
  IF v_open_high_field_observation > 0 THEN
    v_blockers := v_blockers || jsonb_build_array('OPEN_HIGH_FIELD_OBSERVATION');
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
  'Stage 6A: server-authoritative engineering transitions with unchanged Stage 5/B1 blockers and canonical singleton-letter validation before Stage 7; clients.pipeline_stage remains business-only.';

COMMIT;
