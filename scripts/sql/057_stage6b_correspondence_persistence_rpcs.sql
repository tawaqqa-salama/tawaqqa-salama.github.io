-- ============================================================================
-- Stage 6B-2: server-controlled correspondence persistence and approval RPCs
--
-- Depends on 056_stage6b_project_correspondences_schema.sql.
-- Scope:
--   * Minimum approval/concurrency columns required by the Stage 6A contract.
--   * SECURITY DEFINER create-draft, update-draft, and approve RPCs only.
--   * Direct authenticated table INSERT/UPDATE/DELETE remain unavailable.
--
-- Explicitly excluded:
--   * Migration 055 / Stage 7 transition changes.
--   * Legacy singleton migration, browser dual-write, UI, PDF, Storage, or files.
--   * Incoming workflow, recipients/attachments/replies tables, history, snapshots,
--     deletion, immutable revisions, and any final-report cutover.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project_correspondences') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-2 requires public.project_correspondences from Migration 056';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_correspondences'
      AND column_name = 'project_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_correspondences'
      AND column_name = 'client_id'
  ) THEN
    RAISE EXCEPTION 'Stage 6B-2 requires the Stage 6B-1 project/client contract';
  END IF;
END $$;

-- These are the smallest extensions proven necessary by the current Stage 6A
-- singleton approval contract and the approved Stage 6B concurrency audit:
--   recipient_name              -> delivered_to / addressee
--   responsible_engineer_name   -> safety_engineer_name
--   responsible_manager_name    -> manager_name
--   lock_version                -> optimistic concurrency
--   approved_at                 -> authoritative server approval timestamp
ALTER TABLE public.project_correspondences
  ADD COLUMN recipient_name text,
  ADD COLUMN responsible_engineer_name text,
  ADD COLUMN responsible_manager_name text,
  ADD COLUMN lock_version integer NOT NULL DEFAULT 0,
  ADD COLUMN approved_at timestamptz;

ALTER TABLE public.project_correspondences
  ADD CONSTRAINT project_correspondences_lock_version_check
    CHECK (lock_version >= 0),
  ADD CONSTRAINT project_correspondences_approved_at_status_check
    CHECK (
      (document_status = 'approved' AND approved_at IS NOT NULL)
      OR (document_status <> 'approved' AND approved_at IS NULL)
    );

CREATE OR REPLACE FUNCTION public.create_project_correspondence_draft(
  p_project_id uuid,
  p_client_id uuid,
  p_correspondence_type text,
  p_direction text,
  p_subject text,
  p_reference_number text DEFAULT NULL,
  p_correspondence_date date DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_responsible_engineer_name text DEFAULT NULL,
  p_responsible_manager_name text DEFAULT NULL
)
RETURNS public.project_correspondences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_type text := lower(trim(COALESCE(p_correspondence_type, '')));
  v_direction text := lower(trim(COALESCE(p_direction, '')));
  v_subject text := NULLIF(trim(p_subject), '');
  v_row public.project_correspondences%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects AS p
    JOIN public.clients AS c ON c.id = p.client_id
    WHERE p.id = p_project_id
      AND p.client_id = p_client_id
      AND c.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLIENT_MISMATCH';
  END IF;

  IF v_type NOT IN ('engineering_delivery', 'cd_cover_letter') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_CORRESPONDENCE_TYPE';
  END IF;

  -- 056 is schema-ready for incoming records, but no incoming workflow is part
  -- of 6B-2. The first trusted persistence path is outgoing only.
  IF v_direction <> 'outgoing' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_CORRESPONDENCE_DIRECTION';
  END IF;

  IF v_subject IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_INCOMPLETE';
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
    p_project_id,
    p_client_id,
    v_type,
    v_direction,
    v_subject,
    NULLIF(trim(p_reference_number), ''),
    p_correspondence_date,
    p_body,
    NULLIF(trim(p_recipient_name), ''),
    NULLIF(trim(p_responsible_engineer_name), ''),
    NULLIF(trim(p_responsible_manager_name), ''),
    'draft',
    0,
    NULL,
    now(),
    now()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_project_correspondence_draft(
  p_correspondence_id uuid,
  p_expected_lock_version integer,
  p_subject text,
  p_document_status text,
  p_reference_number text DEFAULT NULL,
  p_correspondence_date date DEFAULT NULL,
  p_body text DEFAULT NULL
)
RETURNS public.project_correspondences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_current public.project_correspondences%ROWTYPE;
  v_subject text := NULLIF(trim(p_subject), '');
  v_status text := lower(trim(COALESCE(p_document_status, '')));
  v_row public.project_correspondences%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CORRESPONDENCE_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  v_company_id := public.current_app_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CORRESPONDENCE_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  SELECT pc.*
    INTO v_current
  FROM public.project_correspondences AS pc
  JOIN public.clients AS c ON c.id = pc.client_id
  WHERE pc.id = p_correspondence_id
    AND c.company_id = v_company_id
  FOR UPDATE OF pc;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CORRESPONDENCE_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF v_current.document_status = 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_NOT_EDITABLE';
  END IF;

  IF p_expected_lock_version IS NULL OR p_expected_lock_version <> v_current.lock_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
  END IF;

  IF v_status NOT IN ('draft', 'preparing', 'ready') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_CORRESPONDENCE_STATUS';
  END IF;

  IF v_subject IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_INCOMPLETE';
  END IF;

  UPDATE public.project_correspondences
  SET subject = v_subject,
      reference_number = NULLIF(trim(p_reference_number), ''),
      correspondence_date = p_correspondence_date,
      body = p_body,
      document_status = v_status,
      updated_at = now(),
      lock_version = lock_version + 1
  WHERE id = v_current.id
    AND lock_version = p_expected_lock_version
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_project_correspondence(
  p_correspondence_id uuid,
  p_expected_lock_version integer
)
RETURNS public.project_correspondences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_current public.project_correspondences%ROWTYPE;
  v_row public.project_correspondences%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CORRESPONDENCE_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  v_company_id := public.current_app_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CORRESPONDENCE_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  SELECT pc.*
    INTO v_current
  FROM public.project_correspondences AS pc
  JOIN public.clients AS c ON c.id = pc.client_id
  WHERE pc.id = p_correspondence_id
    AND c.company_id = v_company_id
  FOR UPDATE OF pc;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CORRESPONDENCE_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF v_current.document_status = 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_NOT_EDITABLE';
  END IF;

  IF p_expected_lock_version IS NULL OR p_expected_lock_version <> v_current.lock_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
  END IF;

  IF v_current.document_status <> 'ready'
    OR NULLIF(trim(v_current.subject), '') IS NULL
    OR NULLIF(trim(v_current.reference_number), '') IS NULL
    OR v_current.correspondence_date IS NULL
    OR NULLIF(trim(v_current.recipient_name), '') IS NULL
    OR NULLIF(trim(v_current.responsible_engineer_name), '') IS NULL
    OR NULLIF(trim(v_current.responsible_manager_name), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_INCOMPLETE';
  END IF;

  UPDATE public.project_correspondences
  SET document_status = 'approved',
      approved_at = now(),
      updated_at = now(),
      lock_version = lock_version + 1
  WHERE id = v_current.id
    AND lock_version = p_expected_lock_version
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_STALE_VERSION';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_correspondence_draft(uuid, uuid, text, text, text, text, date, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_project_correspondence_draft(uuid, integer, text, text, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_project_correspondence(uuid, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_project_correspondence_draft(uuid, uuid, text, text, text, text, date, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_project_correspondence_draft(uuid, integer, text, text, text, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.approve_project_correspondence(uuid, integer) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_project_correspondence_draft(uuid, uuid, text, text, text, text, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_correspondence_draft(uuid, integer, text, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_project_correspondence(uuid, integer) TO authenticated;

COMMENT ON COLUMN public.project_correspondences.lock_version IS
  'Stage 6B-2 optimistic concurrency token. Starts at 0 and increments on every trusted update or approval.';

COMMENT ON COLUMN public.project_correspondences.approved_at IS
  'Server-controlled timestamp set only by approve_project_correspondence when content approval is committed.';

COMMENT ON FUNCTION public.create_project_correspondence_draft(uuid, uuid, text, text, text, text, date, text, text, text, text) IS
  'Stage 6B-2: creates an outgoing correspondence draft through server-side auth, tenant, project/client, taxonomy, and subject validation.';

COMMENT ON FUNCTION public.update_project_correspondence_draft(uuid, integer, text, text, text, date, text) IS
  'Stage 6B-2: updates only editable draft content through row locking and optimistic concurrency; identity and approval fields are immutable.';

COMMENT ON FUNCTION public.approve_project_correspondence(uuid, integer) IS
  'Stage 6B-2: atomically content-approves a ready correspondence after Stage 6A-equivalent relational validation; it does not send or issue the document.';

COMMIT;
