-- ============================================================================
-- Stage 6B-3C1: full singleton document bridge + project-edit authorization
--
-- Purpose:
--   * Preserve project_engineering_live.payload as the full canonical Stage 6
--     source of truth.
--   * Accept only a type-specific, server-whitelisted singleton document patch.
--   * Atomically update that singleton and its outgoing compatibility projection.
--   * Enforce the existing legitimate projects.edit role equivalent server-side.
--
-- Explicitly excluded:
--   * UI mutation, approved-model changes, PDF/templates, Stage 6 approval,
--     Migration 055, Stage 7 unlocking, Storage, attachments, backfill, and
--     Production application from source control.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project_correspondences') IS NULL
    OR to_regclass('public.project_engineering_live') IS NULL
    OR to_regclass('public.primary_engineering_project_mappings') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-3C1 requires 056, 058, 059, and project_engineering_live';
  END IF;

  IF to_regprocedure('public.app_role_in(text[])') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-3C1 requires public.app_role_in(text[]) for server authorization';
  END IF;
END
$$;

-- New full-document contract. It is intentionally separate from the 059 subset
-- bridge so deployed semantics remain auditable and the future UI has one clear
-- browser-callable write path.
CREATE OR REPLACE FUNCTION public.save_stage6_singleton_document_bridge(
  p_client_id uuid,
  p_project_id uuid,
  p_correspondence_type text,
  p_expected_lock_version integer,
  p_document jsonb
)
RETURNS public.project_correspondences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_type text := lower(trim(COALESCE(p_correspondence_type, '')));
  v_project_id uuid;
  v_payload jsonb;
  v_document jsonb;
  v_next_document jsonb;
  v_legacy_status text;
  v_relational_status text;
  v_date_key text;
  v_recipient_key text;
  v_subject text;
  v_body text;
  v_date date;
  v_current public.project_correspondences%ROWTYPE;
  v_row public.project_correspondences%ROWTYPE;
  v_key text;
  v_scope jsonb;
  v_invalid boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  -- Tenant membership alone is insufficient. This mirrors the existing
  -- projects.edit-bearing roles without inventing a second role model.
  IF NOT public.app_role_in(ARRAY['super_admin', 'tenant_admin', 'admin', 'manager', 'engineer']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_PERMISSION_DENIED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  IF v_type NOT IN ('engineering_delivery', 'cd_cover_letter') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_CORRESPONDENCE_TYPE';
  END IF;

  IF jsonb_typeof(p_document) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DOCUMENT_PAYLOAD';
  END IF;

  IF p_expected_lock_version IS NULL OR p_expected_lock_version < 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
  END IF;

  -- Reject unknown document keys. The bridge can never merge a browser-provided
  -- top-level payload or change workflow, reports, evidence, or another stage.
  IF v_type = 'engineering_delivery' THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_document) AS supplied_key(key)
      WHERE supplied_key.key NOT IN (
        'status', 'delivery_date', 'delivered_to', 'copy_to', 'study_summary',
        'notes', 'attachments_note', 'attachments_count', 'outgoing_number',
        'hijri_date', 'civil_defense_city', 'building_permit_number',
        'safety_engineer_name', 'safety_engineer_title', 'safety_engineer_phone',
        'manager_name', 'manager_title', 'manager_phone', 'safety_scope'
      )
    ) INTO v_invalid;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_document) AS supplied_key(key)
      WHERE supplied_key.key NOT IN (
        'status', 'letter_date', 'outgoing_number', 'addressee', 'copy_to',
        'building_status', 'manager_name', 'manager_title',
        'safety_engineer_name', 'safety_engineer_title'
      )
    ) INTO v_invalid;
  END IF;

  IF v_invalid THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DOCUMENT_PAYLOAD';
  END IF;

  -- Validate every allowed scalar supplied by the browser. Omitted whitelist keys
  -- remain untouched in the locked canonical document.
  FOREACH v_key IN ARRAY CASE v_type
    WHEN 'engineering_delivery' THEN ARRAY[
      'delivery_date', 'delivered_to', 'copy_to', 'study_summary', 'notes',
      'attachments_note', 'outgoing_number', 'hijri_date', 'civil_defense_city',
      'building_permit_number', 'safety_engineer_name', 'safety_engineer_title',
      'safety_engineer_phone', 'manager_name', 'manager_title', 'manager_phone'
    ]
    ELSE ARRAY[
      'letter_date', 'outgoing_number', 'addressee', 'copy_to', 'building_status',
      'manager_name', 'manager_title', 'safety_engineer_name', 'safety_engineer_title'
    ]
  END LOOP
    IF p_document ? v_key
      AND jsonb_typeof(p_document -> v_key) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DOCUMENT_PAYLOAD';
    END IF;
  END LOOP;

  IF p_document ? 'status'
    AND (jsonb_typeof(p_document -> 'status') <> 'string'
      OR NULLIF(trim(p_document ->> 'status'), '') IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DOCUMENT_PAYLOAD';
  END IF;

  IF v_type = 'engineering_delivery' AND p_document ? 'attachments_count'
    AND jsonb_typeof(p_document -> 'attachments_count') NOT IN ('number', 'string', 'null') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DOCUMENT_PAYLOAD';
  END IF;

  IF v_type = 'engineering_delivery' AND p_document ? 'safety_scope' THEN
    v_scope := p_document -> 'safety_scope';
    IF jsonb_typeof(v_scope) <> 'null' THEN
      IF jsonb_typeof(v_scope) <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DOCUMENT_PAYLOAD';
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_scope) AS scope_row(value)
        WHERE jsonb_typeof(scope_row.value) <> 'object'
          OR NOT (scope_row.value ? 'id' AND scope_row.value ? 'label'
            AND scope_row.value ? 'option' AND scope_row.value ? 'applicable')
          OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(scope_row.value) AS supplied_key(key)
            WHERE supplied_key.key NOT IN ('id', 'label', 'option', 'applicable')
          )
          OR jsonb_typeof(scope_row.value -> 'id') <> 'string'
          OR jsonb_typeof(scope_row.value -> 'label') <> 'string'
          OR jsonb_typeof(scope_row.value -> 'option') <> 'string'
          OR jsonb_typeof(scope_row.value -> 'applicable') <> 'string'
          OR scope_row.value ->> 'id' NOT IN (
            'firefighting', 'alarm', 'smoke_control', 'emergency_exits', 'supervision_contract'
          )
          OR CASE scope_row.value ->> 'id'
            WHEN 'firefighting' THEN scope_row.value ->> 'label' IS DISTINCT FROM 'نظام الإطفاء'
            WHEN 'alarm' THEN scope_row.value ->> 'label' IS DISTINCT FROM 'نظام الإنذار'
            WHEN 'smoke_control' THEN scope_row.value ->> 'label' IS DISTINCT FROM 'نظام سحب والتحكم بالدخان'
            WHEN 'emergency_exits' THEN scope_row.value ->> 'label' IS DISTINCT FROM 'مخارج الطوارئ'
            WHEN 'supervision_contract' THEN scope_row.value ->> 'label' IS DISTINCT FROM 'عقد الإشراف'
            ELSE true
          END
          OR scope_row.value ->> 'option' NOT IN (
            'new_design', 'modify_existing', 'approve_existing', 'not_required', ''
          )
          OR scope_row.value ->> 'applicable' NOT IN ('نعم', 'لا')
      ) INTO v_invalid;

      IF v_invalid OR (
        SELECT count(*) <> count(DISTINCT scope_row.value ->> 'id')
        FROM jsonb_array_elements(v_scope) AS scope_row(value)
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DOCUMENT_PAYLOAD';
      END IF;
    END IF;
  END IF;

  SELECT m.project_id
    INTO v_project_id
  FROM public.primary_engineering_project_mappings AS m
  JOIN public.projects AS p
    ON p.id = m.project_id
   AND p.client_id = m.client_id
  JOIN public.clients AS c
    ON c.id = m.client_id
  WHERE m.client_id = p_client_id
    AND m.project_id = p_project_id
    AND (public.is_platform_admin() OR c.company_id = v_company_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLIENT_MISMATCH';
  END IF;

  SELECT pel.payload
    INTO v_payload
  FROM public.project_engineering_live AS pel
  WHERE pel.client_id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANONICAL_ENGINEERING_STATE_REQUIRED';
  END IF;

  IF COALESCE(v_payload #>> '{workflow,active_stage}', '') <> 'transmittals' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAGE6_NOT_ACTIVE';
  END IF;

  v_document := CASE v_type
    WHEN 'engineering_delivery' THEN v_payload -> 'engineering_delivery'
    ELSE v_payload -> 'cd_cover_letter'
  END;

  IF jsonb_typeof(v_document) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANONICAL_STAGE6_DOCUMENT_REQUIRED';
  END IF;

  -- Existing keys survive exactly unless the browser explicitly supplied the same
  -- whitelisted key. This is a document-level whitelist, not a blind JSON patch.
  v_next_document := v_document || p_document;
  v_legacy_status := COALESCE(NULLIF(trim(v_next_document ->> 'status'), ''), '');

  IF v_legacy_status = 'معتمد' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_NOT_EDITABLE';
  END IF;

  v_relational_status := CASE v_legacy_status
    WHEN 'مسودة' THEN 'draft'
    WHEN 'قيد الإعداد' THEN 'preparing'
    WHEN 'مكتمل' THEN 'ready'
    ELSE NULL
  END;

  IF v_relational_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_CORRESPONDENCE_STATUS';
  END IF;

  v_date_key := CASE v_type
    WHEN 'engineering_delivery' THEN 'delivery_date'
    ELSE 'letter_date'
  END;
  v_recipient_key := CASE v_type
    WHEN 'engineering_delivery' THEN 'delivered_to'
    ELSE 'addressee'
  END;

  IF NULLIF(v_next_document ->> v_date_key, '') IS NOT NULL THEN
    BEGIN
      v_date := (v_next_document ->> v_date_key)::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_DOCUMENT_PAYLOAD';
    END;
  ELSE
    v_date := NULL;
  END IF;

  -- Ready is a document status only. It requires the same smallest issuance
  -- contract used by Stage 6A, but it never approves or unlocks Stage 7.
  IF v_relational_status = 'ready' AND (
    v_date IS NULL
    OR NULLIF(trim(v_next_document ->> v_recipient_key), '') IS NULL
    OR NULLIF(trim(v_next_document ->> 'outgoing_number'), '') IS NULL
    OR NULLIF(trim(v_next_document ->> 'safety_engineer_name'), '') IS NULL
    OR NULLIF(trim(v_next_document ->> 'manager_name'), '') IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_INCOMPLETE';
  END IF;

  v_subject := CASE v_type
    WHEN 'engineering_delivery' THEN 'خطاب تسليم دراسة السلامة'
    ELSE 'خطاب تسليم الدفاع المدني'
  END;
  v_body := CASE v_type
    WHEN 'engineering_delivery' THEN COALESCE(
      NULLIF(trim(v_next_document ->> 'notes'), ''),
      NULLIF(trim(v_next_document ->> 'study_summary'), '')
    )
    ELSE NULL
  END;

  SELECT pc.*
    INTO v_current
  FROM public.project_correspondences AS pc
  WHERE pc.project_id = v_project_id
    AND pc.client_id = p_client_id
    AND pc.correspondence_type = v_type
    AND pc.direction = 'outgoing'
  FOR UPDATE;

  IF FOUND THEN
    IF v_current.document_status = 'approved' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_NOT_EDITABLE';
    END IF;

    IF v_current.lock_version <> p_expected_lock_version THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
    END IF;

    UPDATE public.project_correspondences
    SET subject = v_subject,
        reference_number = NULLIF(trim(v_next_document ->> 'outgoing_number'), ''),
        correspondence_date = v_date,
        body = v_body,
        recipient_name = NULLIF(trim(v_next_document ->> v_recipient_key), ''),
        responsible_engineer_name = NULLIF(trim(v_next_document ->> 'safety_engineer_name'), ''),
        responsible_manager_name = NULLIF(trim(v_next_document ->> 'manager_name'), ''),
        document_status = v_relational_status,
        approved_at = NULL,
        updated_at = now(),
        lock_version = lock_version + 1
    WHERE id = v_current.id
      AND lock_version = p_expected_lock_version
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
    END IF;
  ELSE
    IF p_expected_lock_version <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
    END IF;

    INSERT INTO public.project_correspondences (
      project_id,
      client_id,
      correspondence_type,
      direction,
      subject,
      reference_number,
      correspondence_date,
      body,
      recipient_name,
      responsible_engineer_name,
      responsible_manager_name,
      document_status,
      lock_version,
      approved_at,
      created_at,
      updated_at
    ) VALUES (
      v_project_id,
      p_client_id,
      v_type,
      'outgoing',
      v_subject,
      NULLIF(trim(v_next_document ->> 'outgoing_number'), ''),
      v_date,
      v_body,
      NULLIF(trim(v_next_document ->> v_recipient_key), ''),
      NULLIF(trim(v_next_document ->> 'safety_engineer_name'), ''),
      NULLIF(trim(v_next_document ->> 'manager_name'), ''),
      v_relational_status,
      0,
      NULL,
      now(),
      now()
    )
    ON CONFLICT (project_id, correspondence_type)
      WHERE direction = 'outgoing'
        AND correspondence_type IN ('engineering_delivery', 'cd_cover_letter')
    DO NOTHING
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_SINGLETON_CONFLICT';
    END IF;
  END IF;

  -- The existing Stage 6B-3B trigger is deliberately skipped: the canonical
  -- singleton and its projection were already updated in this transaction.
  PERFORM set_config('app.stage6b3b_bridge', 'on', true);

  v_payload := jsonb_set(
    v_payload,
    CASE v_type
      WHEN 'engineering_delivery' THEN '{engineering_delivery}'::text[]
      ELSE '{cd_cover_letter}'::text[]
    END,
    v_next_document,
    true
  );

  UPDATE public.project_engineering_live
  SET payload = v_payload,
      updated_at = now()
  WHERE client_id = p_client_id;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_stage6_singleton_document_bridge(uuid, uuid, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_stage6_singleton_document_bridge(uuid, uuid, text, integer, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_stage6_singleton_document_bridge(uuid, uuid, text, integer, jsonb)
  TO authenticated, service_role;

-- The 059 subset bridge must not remain a second browser mutation path once the
-- full-document contract is available. Service-role access remains unchanged.
REVOKE EXECUTE ON FUNCTION public.save_stage6_singleton_correspondence_bridge(uuid, uuid, text, integer, text, text, date, text, text, text)
  FROM authenticated;

COMMENT ON FUNCTION public.save_stage6_singleton_document_bridge(uuid, uuid, text, integer, jsonb) IS
  'Stage 6B-3C1: whitelisted full-singleton atomic save with project-edit role enforcement. 055 remains exclusive Stage 6-to-7 authority; no approval semantics are added.';

COMMIT;
