-- ============================================================================
-- PROJECT CLASSIFICATION BACKFILL + LEGACY STATUS SYNC
--
-- Scope:
--   * Extends Basic Data sync with unambiguous legacy project_status mappings.
--   * Adds one-shot tenant-scoped backfill for Production legacy projects.
--   * Adds unresolved-count helper for operational verification.
--
-- Deliberately excluded:
--   * Changes to migration 065 (PR-A1).
--   * Ambiguous operational statuses.
--   * Report content, hydraulics, preview/baseline tooling.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_basic_data_project_classification(
  p_project_classification text,
  p_project_status text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_project_classification IN ('EXISTING', 'UNDER_CONSTRUCTION') THEN p_project_classification
    WHEN btrim(coalesce(p_project_status, '')) IN ('موقع قائم', 'قائم - تحت المعاينة') THEN 'EXISTING'
    WHEN btrim(coalesce(p_project_status, '')) IN ('مشروع قيد الإنشاء', 'تحت الإنشاء') THEN 'UNDER_CONSTRUCTION'
    ELSE NULL
  END;
$$;

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

  v_source_classification := public.resolve_basic_data_project_classification(
    v_client_classification,
    v_client_status
  );

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

CREATE OR REPLACE FUNCTION public.backfill_project_classifications_from_basic_data()
RETURNS TABLE (
  total_candidates bigint,
  synced_count bigint,
  already_classified_count bigint,
  unresolved_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_client_id uuid;
  v_source_classification text;
  v_synced boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLASSIFICATION_ACCESS_DENIED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLASSIFICATION_ACCESS_DENIED';
  END IF;

  total_candidates := 0;
  synced_count := 0;
  already_classified_count := 0;
  unresolved_count := 0;

  FOR v_client_id IN
    SELECT c.id
    FROM public.clients AS c
    JOIN public.primary_engineering_project_mappings AS m
      ON m.client_id = c.id
    JOIN public.projects AS p
      ON p.id = m.project_id
     AND p.client_id = m.client_id
    WHERE public.is_platform_admin()
       OR c.company_id = v_company_id
  LOOP
    total_candidates := total_candidates + 1;
    v_source_classification := NULL;
    v_synced := NULL;

    SELECT s.project_classification, s.synced
      INTO v_source_classification, v_synced
    FROM public.sync_project_classification_from_basic_data(v_client_id) AS s
    LIMIT 1;

    IF v_synced IS TRUE THEN
      synced_count := synced_count + 1;
      CONTINUE;
    END IF;

    IF v_source_classification IN ('EXISTING', 'UNDER_CONSTRUCTION') THEN
      already_classified_count := already_classified_count + 1;
      CONTINUE;
    END IF;

    unresolved_count := unresolved_count + 1;
  END LOOP;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_unresolved_project_classifications()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_count bigint := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLASSIFICATION_ACCESS_DENIED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLASSIFICATION_ACCESS_DENIED';
  END IF;

  SELECT count(*)::bigint
    INTO v_count
  FROM public.clients AS c
  JOIN public.primary_engineering_project_mappings AS m
    ON m.client_id = c.id
  JOIN public.projects AS p
    ON p.id = m.project_id
   AND p.client_id = m.client_id
  WHERE p.project_classification IS NULL
    AND public.resolve_basic_data_project_classification(c.project_classification, c.project_status) IS NULL
    AND (
      public.is_platform_admin()
      OR c.company_id = v_company_id
    );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_basic_data_project_classification(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_basic_data_project_classification(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.backfill_project_classifications_from_basic_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_project_classifications_from_basic_data() FROM anon;
GRANT EXECUTE ON FUNCTION public.backfill_project_classifications_from_basic_data() TO authenticated;

REVOKE ALL ON FUNCTION public.count_unresolved_project_classifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_unresolved_project_classifications() FROM anon;
GRANT EXECUTE ON FUNCTION public.count_unresolved_project_classifications() TO authenticated;

COMMENT ON FUNCTION public.backfill_project_classifications_from_basic_data() IS
  'One-shot tenant-scoped backfill that syncs deterministically classifiable Basic Data into legacy NULL projects.project_classification rows.';

COMMENT ON FUNCTION public.count_unresolved_project_classifications() IS
  'Counts mapped projects that still lack both canonical classification and any unambiguous Basic Data legacy signal.';

COMMIT;
