-- ============================================================================
-- Stage 6B-4A: correspondence attachment metadata contract + authorization
--
-- Scope:
--   * Additive metadata only for Stage 6 outgoing correspondence attachments.
--   * Correspondence-aware, tenant-safe, role-aware lifecycle RPC contracts.
--   * No file-byte upload, object-existence assertion, signed URL, UI, or PDF work.
--
-- Explicitly excluded:
--   * Approved forms and all PDF/templates/signatures/stamps/print layouts.
--   * Migration 055, Migration 061, Workflow, Stage 7, Storage policies, and backfill.
--   * Browser uploads, Storage deletes, generic attachment models, and legacy adoption.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project_correspondences') IS NULL
    OR to_regclass('public.projects') IS NULL
    OR to_regclass('public.clients') IS NULL
    OR to_regclass('public.primary_engineering_project_mappings') IS NULL
    OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-4A requires correspondence, project identity, client, and user contracts';
  END IF;

  IF to_regprocedure('public.current_app_company_id()') IS NULL
    OR to_regprocedure('public.is_platform_admin()') IS NULL
    OR to_regprocedure('public.app_role_in(text[])') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-4A requires tenant and RBAC helpers';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'extra_permissions'
  ) THEN
    RAISE EXCEPTION 'Stage 6B-4A requires public.users.extra_permissions';
  END IF;
END
$$;

-- Composite uniqueness is additive and enables a declarative FK that proves a
-- metadata row belongs to the exact correspondence/project/client triple.
ALTER TABLE public.project_correspondences
  ADD CONSTRAINT project_correspondences_id_project_client_key
  UNIQUE (id, project_id, client_id);

CREATE TABLE public.project_correspondence_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondence_id uuid NOT NULL,
  project_id uuid NOT NULL,
  client_id uuid NOT NULL,

  display_file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'project-files',
  storage_path text NOT NULL,

  state text NOT NULL DEFAULT 'pending_upload',
  idempotency_key text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  cleanup_requested_at timestamptz,
  cleanup_attempts integer NOT NULL DEFAULT 0,
  last_cleanup_error text,

  CONSTRAINT project_correspondence_attachments_correspondence_project_client_fk
    FOREIGN KEY (correspondence_id, project_id, client_id)
    REFERENCES public.project_correspondences(id, project_id, client_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_correspondence_attachments_client_fk
    FOREIGN KEY (client_id)
    REFERENCES public.clients(id)
    ON DELETE RESTRICT,
  CONSTRAINT project_correspondence_attachments_storage_bucket_check
    CHECK (storage_bucket = 'project-files'),
  CONSTRAINT project_correspondence_attachments_state_check
    CHECK (state IN ('pending_upload', 'available', 'pending_delete', 'cleanup_required')),
  CONSTRAINT project_correspondence_attachments_size_check
    CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  CONSTRAINT project_correspondence_attachments_mime_check
    CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT project_correspondence_attachments_display_filename_check
    CHECK (
      display_file_name = btrim(display_file_name)
      AND char_length(display_file_name) BETWEEN 1 AND 255
      AND position('/' IN display_file_name) = 0
      AND position(E'\\' IN display_file_name) = 0
      AND position('..' IN display_file_name) = 0
      AND display_file_name !~ '[[:cntrl:]]'
    ),
  CONSTRAINT project_correspondence_attachments_storage_path_check
    CHECK (
      storage_path = btrim(storage_path)
      AND char_length(storage_path) BETWEEN 1 AND 1024
      AND position(E'\\' IN storage_path) = 0
      AND position('..' IN storage_path) = 0
    ),
  CONSTRAINT project_correspondence_attachments_idempotency_key_check
    CHECK (
      idempotency_key = btrim(idempotency_key)
      AND char_length(idempotency_key) BETWEEN 1 AND 200
      AND idempotency_key !~ '[[:cntrl:]]'
    ),
  CONSTRAINT project_correspondence_attachments_cleanup_attempts_check
    CHECK (cleanup_attempts >= 0),
  CONSTRAINT project_correspondence_attachments_idempotency_key_unique
    UNIQUE (correspondence_id, idempotency_key),
  CONSTRAINT project_correspondence_attachments_storage_object_unique
    UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX idx_project_correspondence_attachments_correspondence_state_created
  ON public.project_correspondence_attachments (correspondence_id, state, created_at DESC);

CREATE INDEX idx_project_correspondence_attachments_client_created
  ON public.project_correspondence_attachments (client_id, created_at DESC);

ALTER TABLE public.project_correspondence_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_correspondence_attachments FROM PUBLIC;
REVOKE ALL ON public.project_correspondence_attachments FROM anon;
REVOKE ALL ON public.project_correspondence_attachments FROM authenticated;
GRANT ALL ON public.project_correspondence_attachments TO service_role;

-- Mirrors the existing UI RBAC matrix server-side, including explicit user
-- grants. This helper accepts only the three document permissions used here.
CREATE OR REPLACE FUNCTION public.stage6b4_document_permission_allowed(
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role_code text;
  v_extra_permissions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.role_code, COALESCE(u.extra_permissions, '[]'::jsonb)
    INTO v_role_code, v_extra_permissions
  FROM public.users AS u
  WHERE u.auth_user_id = auth.uid()
    AND u.deleted_at IS NULL
    AND u.is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.is_platform_admin()
    OR v_role_code IN ('tenant_admin', 'admin')
    OR v_extra_permissions ? '*'
    OR v_extra_permissions ? p_permission THEN
    RETURN true;
  END IF;

  IF p_permission = 'documents.view' THEN
    RETURN v_role_code IN ('manager', 'engineer', 'employee');
  ELSIF p_permission = 'documents.upload' THEN
    RETURN v_role_code = 'manager';
  ELSIF p_permission = 'documents.delete' THEN
    RETURN false;
  END IF;

  RETURN false;
END;
$$;

-- Prepare metadata only. The returned JSON deliberately omits storage_path;
-- Stage 6B-4B's trusted broker will resolve it server-side after byte checks.
CREATE OR REPLACE FUNCTION public.prepare_project_correspondence_attachment(
  p_correspondence_id uuid,
  p_display_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_correspondence public.project_correspondences%ROWTYPE;
  v_existing public.project_correspondence_attachments%ROWTYPE;
  v_attachment_id uuid;
  v_safe_name text;
  v_storage_path text;
  v_active_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  -- Lock the correspondence first. This serializes attachment-limit and
  -- idempotency creation for this correspondence without browser authority.
  SELECT pc.*
    INTO v_correspondence
  FROM public.project_correspondences AS pc
  JOIN public.projects AS p
    ON p.id = pc.project_id
   AND p.client_id = pc.client_id
  JOIN public.clients AS c
    ON c.id = pc.client_id
  JOIN public.primary_engineering_project_mappings AS m
    ON m.client_id = pc.client_id
   AND m.project_id = pc.project_id
  WHERE pc.id = p_correspondence_id
    AND (public.is_platform_admin() OR c.company_id = v_company_id)
  FOR UPDATE OF pc;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CORRESPONDENCE_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF NOT public.stage6b4_document_permission_allowed('documents.upload') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DOCUMENT_PERMISSION_DENIED';
  END IF;

  IF v_correspondence.document_status = 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_APPROVED_IMMUTABLE';
  END IF;

  IF p_display_file_name IS NULL
    OR p_display_file_name <> btrim(p_display_file_name)
    OR char_length(p_display_file_name) NOT BETWEEN 1 AND 255
    OR position('/' IN p_display_file_name) > 0
    OR position(E'\\' IN p_display_file_name) > 0
    OR position('..' IN p_display_file_name) > 0
    OR p_display_file_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_INVALID_FILENAME';
  END IF;

  IF p_mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_INVALID_MIME';
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 20971520 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_INVALID_SIZE';
  END IF;

  IF p_idempotency_key IS NULL
    OR p_idempotency_key <> btrim(p_idempotency_key)
    OR char_length(p_idempotency_key) NOT BETWEEN 1 AND 200
    OR p_idempotency_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_IDEMPOTENCY_CONFLICT';
  END IF;

  SELECT a.*
    INTO v_existing
  FROM public.project_correspondence_attachments AS a
  WHERE a.correspondence_id = v_correspondence.id
    AND a.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM auth.uid()
      OR v_existing.display_file_name IS DISTINCT FROM p_display_file_name
      OR v_existing.mime_type IS DISTINCT FROM p_mime_type
      OR v_existing.size_bytes IS DISTINCT FROM p_size_bytes THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'id', v_existing.id,
      'state', v_existing.state,
      'display_file_name', v_existing.display_file_name,
      'mime_type', v_existing.mime_type,
      'size_bytes', v_existing.size_bytes,
      'idempotent_replay', true
    );
  END IF;

  -- All nonterminal states count. A cleanup artifact cannot create an extra slot.
  SELECT count(*)
    INTO v_active_count
  FROM public.project_correspondence_attachments AS a
  WHERE a.correspondence_id = v_correspondence.id
    AND a.state IN ('pending_upload', 'available', 'pending_delete', 'cleanup_required');

  IF v_active_count >= 10 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_LIMIT_REACHED';
  END IF;

  v_attachment_id := gen_random_uuid();
  v_safe_name := left(regexp_replace(lower(p_display_file_name), '[^a-z0-9._-]+', '-', 'g'), 80);
  v_safe_name := trim(both '-' FROM v_safe_name);
  IF v_safe_name = '' THEN
    v_safe_name := 'file';
  END IF;

  v_storage_path := format(
    '%s/correspondences/%s/attachments/%s/%s',
    v_correspondence.client_id,
    v_correspondence.id,
    v_attachment_id,
    v_safe_name
  );

  INSERT INTO public.project_correspondence_attachments (
    id,
    correspondence_id,
    project_id,
    client_id,
    display_file_name,
    mime_type,
    size_bytes,
    storage_bucket,
    storage_path,
    state,
    idempotency_key,
    created_by
  ) VALUES (
    v_attachment_id,
    v_correspondence.id,
    v_correspondence.project_id,
    v_correspondence.client_id,
    p_display_file_name,
    p_mime_type,
    p_size_bytes,
    'project-files',
    v_storage_path,
    'pending_upload',
    p_idempotency_key,
    auth.uid()
  );

  RETURN jsonb_build_object(
    'id', v_attachment_id,
    'state', 'pending_upload',
    'display_file_name', p_display_file_name,
    'mime_type', p_mime_type,
    'size_bytes', p_size_bytes,
    'idempotent_replay', false
  );
END;
$$;

-- This contract deliberately cannot claim object existence from SQL. It proves
-- caller, tenant, correspondence state, and metadata state, then fails closed
-- until 6B-4B introduces a trusted broker that verifies bytes/object existence.
CREATE OR REPLACE FUNCTION public.finalize_project_correspondence_attachment(
  p_attachment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_attachment public.project_correspondence_attachments%ROWTYPE;
  v_correspondence public.project_correspondences%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  SELECT pc.*
    INTO v_correspondence
  FROM public.project_correspondence_attachments AS a
  JOIN public.project_correspondences AS pc
    ON pc.id = a.correspondence_id
   AND pc.project_id = a.project_id
   AND pc.client_id = a.client_id
  JOIN public.clients AS c
    ON c.id = pc.client_id
  JOIN public.primary_engineering_project_mappings AS m
    ON m.client_id = pc.client_id
   AND m.project_id = pc.project_id
  WHERE a.id = p_attachment_id
    AND (public.is_platform_admin() OR c.company_id = v_company_id)
  FOR UPDATE OF a, pc;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTACHMENT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  SELECT a.*
    INTO v_attachment
  FROM public.project_correspondence_attachments AS a
  WHERE a.id = p_attachment_id;

  IF NOT public.stage6b4_document_permission_allowed('documents.upload') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DOCUMENT_PERMISSION_DENIED';
  END IF;

  IF v_correspondence.document_status = 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_APPROVED_IMMUTABLE';
  END IF;

  IF v_attachment.state <> 'pending_upload' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_INVALID_STATE';
  END IF;

  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_FINALIZATION_REQUIRES_TRUSTED_BROKER';
END;
$$;

-- Metadata-side deletion request only. No Storage object is removed here; B4B
-- must perform object cleanup/compensation and then resolve final metadata state.
CREATE OR REPLACE FUNCTION public.request_delete_project_correspondence_attachment(
  p_attachment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_attachment public.project_correspondence_attachments%ROWTYPE;
  v_correspondence public.project_correspondences%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  SELECT pc.*
    INTO v_correspondence
  FROM public.project_correspondence_attachments AS a
  JOIN public.project_correspondences AS pc
    ON pc.id = a.correspondence_id
   AND pc.project_id = a.project_id
   AND pc.client_id = a.client_id
  JOIN public.clients AS c
    ON c.id = pc.client_id
  JOIN public.primary_engineering_project_mappings AS m
    ON m.client_id = pc.client_id
   AND m.project_id = pc.project_id
  WHERE a.id = p_attachment_id
    AND (public.is_platform_admin() OR c.company_id = v_company_id)
  FOR UPDATE OF a, pc;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ATTACHMENT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  SELECT a.*
    INTO v_attachment
  FROM public.project_correspondence_attachments AS a
  WHERE a.id = p_attachment_id;

  IF NOT public.stage6b4_document_permission_allowed('documents.delete') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DOCUMENT_PERMISSION_DENIED';
  END IF;

  IF v_correspondence.document_status = 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CORRESPONDENCE_APPROVED_IMMUTABLE';
  END IF;

  IF v_attachment.state = 'pending_delete' THEN
    RETURN jsonb_build_object('id', v_attachment.id, 'state', 'pending_delete', 'idempotent_replay', true);
  END IF;

  IF v_attachment.state NOT IN ('pending_upload', 'available') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTACHMENT_INVALID_STATE';
  END IF;

  UPDATE public.project_correspondence_attachments
  SET state = 'pending_delete',
      cleanup_requested_at = now(),
      cleanup_attempts = cleanup_attempts + 1,
      last_cleanup_error = NULL
  WHERE id = v_attachment.id
  RETURNING * INTO v_attachment;

  RETURN jsonb_build_object('id', v_attachment.id, 'state', v_attachment.state, 'idempotent_replay', false);
END;
$$;

-- UI-safe metadata read. It returns no storage_path, idempotency key, creator,
-- cleanup diagnostics, or signed URL. The attachment ID remains the future
-- server-side authorization handle for B4B signed download.
CREATE OR REPLACE FUNCTION public.list_project_correspondence_attachments(
  p_correspondence_id uuid
)
RETURNS TABLE (
  id uuid,
  display_file_name text,
  mime_type text,
  size_bytes bigint,
  state text,
  created_at timestamptz,
  cleanup_requested_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_correspondences AS pc
    JOIN public.projects AS p
      ON p.id = pc.project_id
     AND p.client_id = pc.client_id
    JOIN public.clients AS c
      ON c.id = pc.client_id
    JOIN public.primary_engineering_project_mappings AS m
      ON m.client_id = pc.client_id
     AND m.project_id = pc.project_id
    WHERE pc.id = p_correspondence_id
      AND (public.is_platform_admin() OR c.company_id = v_company_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CORRESPONDENCE_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF NOT public.stage6b4_document_permission_allowed('documents.view') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DOCUMENT_PERMISSION_DENIED';
  END IF;

  RETURN QUERY
  SELECT a.id,
         a.display_file_name,
         a.mime_type,
         a.size_bytes,
         a.state,
         a.created_at,
         a.cleanup_requested_at
  FROM public.project_correspondence_attachments AS a
  WHERE a.correspondence_id = p_correspondence_id
  ORDER BY a.created_at ASC, a.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.stage6b4_document_permission_allowed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage6b4_document_permission_allowed(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.stage6b4_document_permission_allowed(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.prepare_project_correspondence_attachment(uuid, text, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_project_correspondence_attachment(uuid, text, text, bigint, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.prepare_project_correspondence_attachment(uuid, text, text, bigint, text) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_project_correspondence_attachment(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.request_delete_project_correspondence_attachment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_delete_project_correspondence_attachment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_delete_project_correspondence_attachment(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.list_project_correspondence_attachments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_project_correspondence_attachments(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_project_correspondence_attachments(uuid) TO authenticated;

COMMENT ON TABLE public.project_correspondence_attachments IS
  'Stage 6B-4A correspondence attachment metadata only. Tenant and project/client ownership are derived through the exact correspondence identity; no signed URL or file bytes are stored here.';

COMMENT ON FUNCTION public.prepare_project_correspondence_attachment(uuid, text, text, bigint, text) IS
  'Stage 6B-4A metadata-only prepare. Creates pending_upload metadata and a server-generated project-files path without uploading bytes or exposing that path to the caller.';

COMMENT ON FUNCTION public.finalize_project_correspondence_attachment(uuid) IS
  'Stage 6B-4A fail-closed finalize contract. It verifies caller/tenant/metadata state then refuses to mark available until the trusted Storage broker in Stage 6B-4B proves exact object existence and byte validation.';

COMMENT ON FUNCTION public.request_delete_project_correspondence_attachment(uuid) IS
  'Stage 6B-4A metadata-side delete request. It marks pending_delete only; it does not delete a Storage object.';

COMMENT ON FUNCTION public.list_project_correspondence_attachments(uuid) IS
  'Stage 6B-4A tenant-safe UI metadata list. It intentionally omits storage_path, idempotency, cleanup diagnostics, and signed URLs.';

COMMIT;
