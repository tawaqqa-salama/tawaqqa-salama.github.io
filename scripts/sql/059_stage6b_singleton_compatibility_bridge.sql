-- ============================================================================
-- Stage 6B-3B: singleton correspondence invariant + server compatibility bridge
--
-- Purpose:
--   * Keep project_engineering_live.payload as the Stage 6 / Migration 055 source
--     of truth.
--   * Project one outgoing singleton correspondence per canonical project/type.
--   * Provide one future mutation entry point that updates the canonical singleton
--     payload and its relational projection in the same database transaction.
--
-- Explicitly excluded:
--   * Any change to Migration 055, Stage 6 -> Stage 7 authority, approved models,
--     PDF/templates, UI mutation controls, Storage, attachments, data backfill,
--     or Production application.
--   * Relational approval as a workflow authority. The bridge accepts only
--     draft/preparing/ready and never writes an approved relational status.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project_correspondences') IS NULL
    OR to_regclass('public.project_engineering_live') IS NULL
    OR to_regclass('public.primary_engineering_project_mappings') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-3B requires 056, 058, and project_engineering_live';
  END IF;

  -- Do not install a singleton invariant over Production data that is already
  -- ambiguous. This phase creates no adoption/backfill rows.
  IF EXISTS (
    SELECT 1
    FROM public.project_correspondences AS pc
    WHERE pc.direction = 'outgoing'
      AND pc.correspondence_type IN ('engineering_delivery', 'cd_cover_letter')
    GROUP BY pc.project_id, pc.correspondence_type
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Stage 6B-3B cannot enforce singleton invariant: duplicate outgoing canonical rows exist';
  END IF;
END
$$;

-- Only the two approved Stage 6 singleton types are constrained. Future incoming
-- correspondence workflows remain outside this invariant and outside this phase.
CREATE UNIQUE INDEX IF NOT EXISTS project_correspondences_stage6_singleton_outgoing_idx
  ON public.project_correspondences (project_id, correspondence_type)
  WHERE direction = 'outgoing'
    AND correspondence_type IN ('engineering_delivery', 'cd_cover_letter');

-- Server-only projection used when the already-approved singleton forms are saved
-- through the canonical live payload path. It intentionally derives only the
-- display-safe relational subset and never changes the legacy payload.
CREATE OR REPLACE FUNCTION public.sync_stage6_singleton_correspondence_from_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_project_id uuid;
  v_active_stage text;
  v_type text;
  v_document jsonb;
  v_subject text;
  v_body text;
  v_status text;
  v_current public.project_correspondences%ROWTYPE;
BEGIN
  -- The atomic bridge below writes both stores itself. Skipping the trigger avoids
  -- a second projection update and preserves the bridge lock_version exactly.
  IF current_setting('app.stage6b3b_bridge', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- No page-load, unrelated-stage, or no-op payload save may create/adopt a row.
  IF NEW.payload -> 'engineering_delivery' IS NOT DISTINCT FROM OLD.payload -> 'engineering_delivery'
    AND NEW.payload -> 'cd_cover_letter' IS NOT DISTINCT FROM OLD.payload -> 'cd_cover_letter' THEN
    RETURN NEW;
  END IF;

  SELECT m.project_id
    INTO v_project_id
  FROM public.primary_engineering_project_mappings AS m
  JOIN public.projects AS p
    ON p.id = m.project_id
   AND p.client_id = m.client_id
  WHERE m.client_id = NEW.client_id;

  -- A missing canonical identity is a controlled no-projection state. The live
  -- singleton save remains valid and no resolver/first-project fallback is used.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_active_stage := COALESCE(NEW.payload #>> '{workflow,active_stage}', '');

  -- Only an explicit save while Stage 6 is active may project or create a
  -- correspondence. In particular, Migration 055's atomic transition to
  -- final_report must remain independent and must never be blocked by the
  -- compatibility representation.
  IF v_active_stage <> 'transmittals' THEN
    RETURN NEW;
  END IF;

  FOR v_type, v_document IN
    SELECT 'engineering_delivery'::text, NEW.payload -> 'engineering_delivery'
    UNION ALL
    SELECT 'cd_cover_letter'::text, NEW.payload -> 'cd_cover_letter'
  LOOP
    -- A save of one approved singleton must not synthesize or bump the version of
    -- the other singleton correspondence. This also prevents implicit migration
    -- of a sibling document that was merely present in the same JSONB payload.
    IF (v_type = 'engineering_delivery'
          AND NEW.payload -> 'engineering_delivery' IS NOT DISTINCT FROM OLD.payload -> 'engineering_delivery')
      OR (v_type = 'cd_cover_letter'
          AND NEW.payload -> 'cd_cover_letter' IS NOT DISTINCT FROM OLD.payload -> 'cd_cover_letter') THEN
      CONTINUE;
    END IF;

    IF jsonb_typeof(v_document) IS DISTINCT FROM 'object' THEN
      CONTINUE;
    END IF;

    v_status := CASE COALESCE(v_document ->> 'status', '')
      WHEN 'مسودة' THEN 'draft'
      WHEN 'قيد الإعداد' THEN 'preparing'
      WHEN 'مكتمل' THEN 'ready'
      -- Migration 055 remains authoritative. Its legacy approval is represented
      -- relationally as ready, never as an independent Stage 7 unlock.
      WHEN 'معتمد' THEN 'ready'
      ELSE NULL
    END;

    IF v_status IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAGE6_LEGACY_STATUS_INVALID';
    END IF;

    v_subject := CASE v_type
      WHEN 'engineering_delivery' THEN 'خطاب تسليم دراسة السلامة'
      WHEN 'cd_cover_letter' THEN 'خطاب تسليم الدفاع المدني'
    END;

    -- `body` is a read-only compatibility derivation. There is no lossless
    -- relational destination for all approved note fields, so the future bridge
    -- below deliberately does not accept body as browser-editable input.
    v_body := CASE v_type
      WHEN 'engineering_delivery' THEN COALESCE(
        NULLIF(trim(v_document ->> 'notes'), ''),
        NULLIF(trim(v_document ->> 'study_summary'), '')
      )
      ELSE NULL
    END;

    SELECT pc.*
      INTO v_current
    FROM public.project_correspondences AS pc
    WHERE pc.project_id = v_project_id
      AND pc.client_id = NEW.client_id
      AND pc.correspondence_type = v_type
      AND pc.direction = 'outgoing'
    FOR UPDATE;

    IF FOUND THEN
      -- A relational approved row is immutable. Rejecting the canonical save is
      -- safer than silently creating legacy/relational divergence.
      IF v_current.document_status = 'approved' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_NOT_EDITABLE';
      END IF;

      UPDATE public.project_correspondences
      SET subject = v_subject,
          reference_number = NULLIF(trim(v_document ->> 'outgoing_number'), ''),
          correspondence_date = CASE v_type
            WHEN 'engineering_delivery' THEN NULLIF(v_document ->> 'delivery_date', '')::date
            ELSE NULLIF(v_document ->> 'letter_date', '')::date
          END,
          body = v_body,
          recipient_name = CASE v_type
            WHEN 'engineering_delivery' THEN NULLIF(trim(v_document ->> 'delivered_to'), '')
            ELSE NULLIF(trim(v_document ->> 'addressee'), '')
          END,
          responsible_engineer_name = NULLIF(trim(v_document ->> 'safety_engineer_name'), ''),
          responsible_manager_name = NULLIF(trim(v_document ->> 'manager_name'), ''),
          document_status = v_status,
          approved_at = NULL,
          updated_at = now(),
          lock_version = lock_version + 1
      WHERE id = v_current.id;
    ELSE
      -- Explicit Stage 6 saves may create the compatibility representation. The
      -- active-stage guard above ensures a workflow transition never backfills or
      -- adopts a missing row.
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
        NEW.client_id,
        v_type,
        'outgoing',
        v_subject,
        NULLIF(trim(v_document ->> 'outgoing_number'), ''),
        CASE v_type
          WHEN 'engineering_delivery' THEN NULLIF(v_document ->> 'delivery_date', '')::date
          ELSE NULLIF(v_document ->> 'letter_date', '')::date
        END,
        v_body,
        CASE v_type
          WHEN 'engineering_delivery' THEN NULLIF(trim(v_document ->> 'delivered_to'), '')
          ELSE NULLIF(trim(v_document ->> 'addressee'), '')
        END,
        NULLIF(trim(v_document ->> 'safety_engineer_name'), ''),
        NULLIF(trim(v_document ->> 'manager_name'), ''),
        v_status,
        0,
        NULL,
        now(),
        now()
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_stage6_singleton_correspondence_from_live() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_stage6_singleton_correspondence_from_live() FROM anon;
REVOKE ALL ON FUNCTION public.sync_stage6_singleton_correspondence_from_live() FROM authenticated;

DROP TRIGGER IF EXISTS stage6_singleton_correspondence_projection ON public.project_engineering_live;
CREATE TRIGGER stage6_singleton_correspondence_projection
AFTER UPDATE OF payload ON public.project_engineering_live
FOR EACH ROW
EXECUTE FUNCTION public.sync_stage6_singleton_correspondence_from_live();

-- The only browser-callable persistence contract for a future Stage 6B-3C editor.
-- It validates canonical identity server-side, locks both representations, maps the
-- relational subset to the singleton JSONB, and returns a single canonical row.
CREATE OR REPLACE FUNCTION public.save_stage6_singleton_correspondence_bridge(
  p_client_id uuid,
  p_project_id uuid,
  p_correspondence_type text,
  p_expected_lock_version integer,
  p_document_status text,
  p_reference_number text,
  p_correspondence_date date,
  p_recipient_name text,
  p_responsible_engineer_name text,
  p_responsible_manager_name text
)
RETURNS public.project_correspondences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_type text := lower(trim(COALESCE(p_correspondence_type, '')));
  v_status text := lower(trim(COALESCE(p_document_status, '')));
  v_legacy_status text;
  v_project_id uuid;
  v_payload jsonb;
  v_document jsonb;
  v_subject text;
  v_body text;
  v_current public.project_correspondences%ROWTYPE;
  v_row public.project_correspondences%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  IF v_type NOT IN ('engineering_delivery', 'cd_cover_letter') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_CORRESPONDENCE_TYPE';
  END IF;

  IF v_status NOT IN ('draft', 'preparing', 'ready') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_CORRESPONDENCE_STATUS';
  END IF;

  IF p_expected_lock_version IS NULL OR p_expected_lock_version < 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
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
    WHEN 'engineering_delivery' THEN COALESCE(v_payload -> 'engineering_delivery', '{}'::jsonb)
    ELSE COALESCE(v_payload -> 'cd_cover_letter', '{}'::jsonb)
  END;

  IF jsonb_typeof(v_document) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANONICAL_STAGE6_DOCUMENT_REQUIRED';
  END IF;

  v_legacy_status := CASE v_status
    WHEN 'draft' THEN 'مسودة'
    WHEN 'preparing' THEN 'قيد الإعداد'
    WHEN 'ready' THEN 'مكتمل'
  END;

  v_subject := CASE v_type
    WHEN 'engineering_delivery' THEN 'خطاب تسليم دراسة السلامة'
    WHEN 'cd_cover_letter' THEN 'خطاب تسليم الدفاع المدني'
  END;

  v_body := CASE v_type
    WHEN 'engineering_delivery' THEN COALESCE(
      NULLIF(trim(v_document ->> 'notes'), ''),
      NULLIF(trim(v_document ->> 'study_summary'), '')
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
        reference_number = NULLIF(trim(p_reference_number), ''),
        correspondence_date = p_correspondence_date,
        body = v_body,
        recipient_name = NULLIF(trim(p_recipient_name), ''),
        responsible_engineer_name = NULLIF(trim(p_responsible_engineer_name), ''),
        responsible_manager_name = NULLIF(trim(p_responsible_manager_name), ''),
        document_status = v_status,
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
      NULLIF(trim(p_reference_number), ''),
      p_correspondence_date,
      v_body,
      NULLIF(trim(p_recipient_name), ''),
      NULLIF(trim(p_responsible_engineer_name), ''),
      NULLIF(trim(p_responsible_manager_name), ''),
      v_status,
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
      -- A concurrent creator won the unique singleton invariant. Return a safe
      -- conflict instead of creating another row or overwriting its content.
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_SINGLETON_CONFLICT';
    END IF;
  END IF;

  -- The trigger is skipped for this statement because the relational update above
  -- and the JSONB update below are already inside this one atomic function.
  PERFORM set_config('app.stage6b3b_bridge', 'on', true);

  v_document := jsonb_set(v_document, '{status}', to_jsonb(v_legacy_status), true);
  v_document := jsonb_set(v_document, '{outgoing_number}', to_jsonb(COALESCE(NULLIF(trim(p_reference_number), ''), '')), true);
  v_document := jsonb_set(
    v_document,
    CASE v_type
      WHEN 'engineering_delivery' THEN '{delivery_date}'::text[]
      ELSE '{letter_date}'::text[]
    END,
    to_jsonb(COALESCE(p_correspondence_date::text, '')),
    true
  );
  v_document := jsonb_set(
    v_document,
    CASE v_type
      WHEN 'engineering_delivery' THEN '{delivered_to}'::text[]
      ELSE '{addressee}'::text[]
    END,
    to_jsonb(COALESCE(NULLIF(trim(p_recipient_name), ''), '')),
    true
  );
  v_document := jsonb_set(v_document, '{safety_engineer_name}', to_jsonb(COALESCE(NULLIF(trim(p_responsible_engineer_name), ''), '')), true);
  v_document := jsonb_set(v_document, '{manager_name}', to_jsonb(COALESCE(NULLIF(trim(p_responsible_manager_name), ''), '')), true);

  v_payload := jsonb_set(
    v_payload,
    CASE v_type
      WHEN 'engineering_delivery' THEN '{engineering_delivery}'::text[]
      ELSE '{cd_cover_letter}'::text[]
    END,
    v_document,
    true
  );

  UPDATE public.project_engineering_live
  SET payload = v_payload,
      updated_at = now()
  WHERE client_id = p_client_id;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_stage6_singleton_correspondence_bridge(uuid, uuid, text, integer, text, text, date, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_stage6_singleton_correspondence_bridge(uuid, uuid, text, integer, text, text, date, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_stage6_singleton_correspondence_bridge(uuid, uuid, text, integer, text, text, date, text, text, text)
  TO authenticated, service_role;

-- Old relational-only mutation paths cannot remain browser-callable once a bridge
-- exists; otherwise they provide a parallel route that can diverge from JSONB.
REVOKE EXECUTE ON FUNCTION public.create_project_correspondence_draft(uuid, uuid, text, text, text, text, date, text, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_project_correspondence_draft(uuid, integer, text, text, text, date, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_project_correspondence(uuid, integer) FROM authenticated;

COMMENT ON INDEX public.project_correspondences_stage6_singleton_outgoing_idx IS
  'Stage 6B-3B: one outgoing canonical singleton correspondence per project/type; no incoming workflow semantics are implied.';

COMMENT ON FUNCTION public.sync_stage6_singleton_correspondence_from_live() IS
  'Stage 6B-3B: server-only projection from explicit Stage 6 singleton payload saves; no page-load adoption and no Stage 7 authority.';

COMMENT ON FUNCTION public.save_stage6_singleton_correspondence_bridge(uuid, uuid, text, integer, text, text, date, text, text, text) IS
  'Stage 6B-3B: atomic future-edit bridge for the mapped singleton subset only. Migration 055 remains the exclusive Stage 6 to Stage 7 authority.';

COMMIT;
