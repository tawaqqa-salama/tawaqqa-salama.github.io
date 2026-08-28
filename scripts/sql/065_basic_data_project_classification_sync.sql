-- ============================================================================
-- BASIC DATA → PROJECT CLASSIFICATION SYNC
--
-- Scope:
--   * Adds canonical Basic Data classification on public.clients.
--   * Server-only sync into public.projects.project_classification for legacy
--     NULL projects when Basic Data has an explicit classification value.
--
-- Deliberately excluded:
--   * Inference from operational project_status values other than the exact
--     Basic Data labels (موقع قائم / مشروع قيد الإنشاء).
--   * Report content, workflow stages, PDFs, and unrelated UI changes.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'BASIC_DATA_CLASSIFICATION requires public.clients';
  END IF;

  IF to_regclass('public.projects') IS NULL THEN
    RAISE EXCEPTION 'BASIC_DATA_CLASSIFICATION requires public.projects';
  END IF;

  IF to_regclass('public.primary_engineering_project_mappings') IS NULL THEN
    RAISE EXCEPTION 'BASIC_DATA_CLASSIFICATION requires primary_engineering_project_mappings';
  END IF;
END $$;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS project_classification text NULL;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_project_classification_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_project_classification_check
  CHECK (
    project_classification IS NULL
    OR project_classification IN ('EXISTING', 'UNDER_CONSTRUCTION')
  );

COMMENT ON COLUMN public.clients.project_classification IS
  'Canonical Basic Data engineering classification. Synced to public.projects.project_classification by sync_project_classification_from_basic_data.';

CREATE OR REPLACE FUNCTION public.sync_project_classification_from_basic_data(
  p_client_id uuid
)
RETURNS TABLE (
  project_id uuid,
  client_id uuid,
  project_code text,
  project_classification text,
  synced boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_client_classification text;
  v_client_status text;
  v_source_classification text;
  v_existing_project_id uuid;
  v_project_code text;
  v_existing_classification text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLASSIFICATION_ACCESS_DENIED';
  END IF;

  IF p_client_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROJECT_CLASSIFICATION_CLIENT_REQUIRED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLASSIFICATION_ACCESS_DENIED';
  END IF;

  SELECT c.project_classification, c.project_status
    INTO v_client_classification, v_client_status
  FROM public.clients AS c
  WHERE c.id = p_client_id
    AND (
      public.is_platform_admin()
      OR c.company_id = v_company_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLASSIFICATION_CLIENT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  v_source_classification := NULL;

  IF v_client_classification IN ('EXISTING', 'UNDER_CONSTRUCTION') THEN
    v_source_classification := v_client_classification;
  ELSIF btrim(coalesce(v_client_status, '')) = 'موقع قائم' THEN
    v_source_classification := 'EXISTING';
  ELSIF btrim(coalesce(v_client_status, '')) = 'مشروع قيد الإنشاء' THEN
    v_source_classification := 'UNDER_CONSTRUCTION';
  END IF;

  IF v_source_classification IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_client_id::text));

  IF v_client_classification IS NULL THEN
    UPDATE public.clients AS c
    SET project_classification = v_source_classification
    WHERE c.id = p_client_id
      AND c.project_classification IS NULL;
  END IF;

  SELECT m.project_id, p.project_code, p.project_classification
    INTO v_existing_project_id, v_project_code, v_existing_classification
  FROM public.primary_engineering_project_mappings AS m
  JOIN public.projects AS p
    ON p.id = m.project_id
   AND p.client_id = m.client_id
  WHERE m.client_id = p_client_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_existing_classification IS NULL THEN
    UPDATE public.projects AS p
    SET project_classification = v_source_classification
    WHERE p.id = v_existing_project_id
      AND p.client_id = p_client_id
      AND p.project_classification IS NULL;

    RETURN QUERY
    SELECT v_existing_project_id, p_client_id, v_project_code, v_source_classification, true;
    RETURN;
  END IF;

  IF v_existing_classification <> v_source_classification THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROJECT_CLASSIFICATION_IMMUTABLE';
  END IF;

  RETURN QUERY
  SELECT v_existing_project_id, p_client_id, v_project_code, v_existing_classification, false;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_project_classification_from_basic_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_project_classification_from_basic_data(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_project_classification_from_basic_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.sync_project_classification_from_basic_data(uuid) IS
  'Syncs explicit Basic Data classification into the mapped primary engineering project when the project row is still legacy NULL. Never infers from operational status text.';

COMMIT;
