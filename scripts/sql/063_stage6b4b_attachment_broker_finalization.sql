-- ============================================================================
-- Stage 6B-4B: trusted correspondence attachment broker finalization
--
-- Scope: service-role-only metadata transition after the JWT-protected Edge
-- broker validates bytes and exact attachment ownership. No Storage policy,
-- UI, approved document, PDF/template, 055/061, Workflow, or Stage 7 change.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project_correspondence_attachments') IS NULL
    OR to_regclass('public.project_correspondences') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-4B requires the Stage 6B-4A attachment contract';
  END IF;
END
$$;

ALTER TABLE public.project_correspondence_attachments
  ADD COLUMN sha256_hex text,
  ADD CONSTRAINT project_correspondence_attachments_sha256_hex_check
    CHECK (sha256_hex IS NULL OR sha256_hex ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.finalize_project_correspondence_attachment(
  p_attachment_id uuid,
  p_verified_size_bytes bigint,
  p_verified_mime_type text,
  p_sha256_hex text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_attachment public.project_correspondence_attachments%ROWTYPE;
  v_document_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TRUSTED_BROKER_ONLY';
  END IF;

  IF p_sha256_hex IS NULL OR p_sha256_hex !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_INVALID_CHECKSUM';
  END IF;

  SELECT a.*
    INTO v_attachment
  FROM public.project_correspondence_attachments AS a
  JOIN public.project_correspondences AS pc
    ON pc.id = a.correspondence_id
   AND pc.project_id = a.project_id
   AND pc.client_id = a.client_id
  WHERE a.id = p_attachment_id
  FOR UPDATE OF a, pc;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_NOT_FOUND';
  END IF;

  SELECT pc.document_status
    INTO v_document_status
  FROM public.project_correspondences AS pc
  WHERE pc.id = v_attachment.correspondence_id;

  IF v_document_status = 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_APPROVED_IMMUTABLE';
  END IF;

  IF v_attachment.state = 'available'
    AND v_attachment.size_bytes = p_verified_size_bytes
    AND v_attachment.mime_type = p_verified_mime_type
    AND v_attachment.sha256_hex = p_sha256_hex THEN
    RETURN jsonb_build_object('id', v_attachment.id, 'state', 'available', 'idempotent_replay', true);
  END IF;

  IF v_attachment.state <> 'pending_upload'
    OR v_attachment.size_bytes <> p_verified_size_bytes
    OR v_attachment.mime_type <> p_verified_mime_type THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_FINALIZATION_MISMATCH';
  END IF;

  UPDATE public.project_correspondence_attachments
  SET state = 'available',
      sha256_hex = p_sha256_hex,
      cleanup_requested_at = NULL,
      last_cleanup_error = NULL
  WHERE id = v_attachment.id;

  RETURN jsonb_build_object('id', v_attachment.id, 'state', 'available', 'idempotent_replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_project_correspondence_attachment_cleanup_required(
  p_attachment_id uuid,
  p_error_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_attachment public.project_correspondence_attachments%ROWTYPE;
  v_document_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TRUSTED_BROKER_ONLY';
  END IF;

  SELECT a.*
    INTO v_attachment
  FROM public.project_correspondence_attachments AS a
  JOIN public.project_correspondences AS pc
    ON pc.id = a.correspondence_id
   AND pc.project_id = a.project_id
   AND pc.client_id = a.client_id
  WHERE a.id = p_attachment_id
  FOR UPDATE OF a, pc;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_NOT_FOUND';
  END IF;

  SELECT pc.document_status
    INTO v_document_status
  FROM public.project_correspondences AS pc
  WHERE pc.id = v_attachment.correspondence_id;

  IF v_document_status = 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_APPROVED_IMMUTABLE';
  END IF;

  IF v_attachment.state NOT IN ('pending_upload', 'pending_delete', 'cleanup_required') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_INVALID_STATE';
  END IF;

  UPDATE public.project_correspondence_attachments
  SET state = 'cleanup_required',
      cleanup_requested_at = COALESCE(cleanup_requested_at, now()),
      cleanup_attempts = cleanup_attempts + 1,
      last_cleanup_error = left(COALESCE(NULLIF(btrim(p_error_code), ''), 'BROKER_CLEANUP_FAILED'), 120)
  WHERE id = v_attachment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid, bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid, bigint, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid, bigint, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_project_correspondence_attachment(uuid, bigint, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.mark_project_correspondence_attachment_cleanup_required(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_project_correspondence_attachment_cleanup_required(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.mark_project_correspondence_attachment_cleanup_required(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_project_correspondence_attachment_cleanup_required(uuid, text) TO service_role;

COMMENT ON FUNCTION public.finalize_project_correspondence_attachment(uuid, bigint, text, text) IS
  'Stage 6B-4B service-role-only transition after trusted Edge broker verifies exact object bytes, MIME, size, checksum, tenant, and correspondence state.';

COMMENT ON FUNCTION public.mark_project_correspondence_attachment_cleanup_required(uuid, text) IS
  'Stage 6B-4B service-role-only metadata compensation after a broker cleanup failure; it never deletes Storage objects itself.';

COMMIT;
