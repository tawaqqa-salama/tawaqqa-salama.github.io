-- ============================================================================
-- PROJECT CLASSIFICATION FOUNDATION
--
-- Scope:
--   * Adds nullable canonical classification to public.projects.
--   * Adds a server-only classified-project resolver for newly created Sales clients.
--   * Preserves existing legacy projects as NULL / UNCLASSIFIED (no backfill).
--
-- Deliberately excluded:
--   * Automatic/backfill writes, technical-report UI/PDF/routing, lifecycle inference,
--     workflow/pipeline changes, hydraulic calculations, RLS policy changes, Storage.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE EXCEPTION 'PROJECT_CLASSIFICATION requires public.projects';
  END IF;

  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'PROJECT_CLASSIFICATION requires public.clients';
  END IF;

  IF to_regclass('public.primary_engineering_project_mappings') IS NULL THEN
    RAISE EXCEPTION 'PROJECT_CLASSIFICATION requires primary_engineering_project_mappings';
  END IF;

  IF to_regclass('public.project_code_year_sequences') IS NULL THEN
    RAISE EXCEPTION 'PROJECT_CLASSIFICATION requires project_code_year_sequences';
  END IF;
END $$;

-- NULL means a legacy project that has not yet received an explicit, human-reviewed
-- classification. It must never be inferred from operational status or report payloads.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_classification text NULL;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_project_classification_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_project_classification_check
  CHECK (
    project_classification IS NULL
    OR project_classification IN ('EXISTING', 'UNDER_CONSTRUCTION')
  );

COMMENT ON COLUMN public.projects.project_classification IS
  'Canonical engineering project identity classification: EXISTING or UNDER_CONSTRUCTION. NULL is legacy unclassified and must never be inferred automatically.';

CREATE OR REPLACE FUNCTION public.create_or_resolve_classified_engineering_project_for_client(
  p_client_id uuid,
  p_project_classification text
)
RETURNS TABLE (
  project_id uuid,
  client_id uuid,
  project_code text,
  project_classification text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_calendar_year integer;
  v_sequence_value integer;
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

  IF p_project_classification NOT IN ('EXISTING', 'UNDER_CONSTRUCTION') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROJECT_CLASSIFICATION_INVALID';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLASSIFICATION_ACCESS_DENIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients AS c
    WHERE c.id = p_client_id
      AND (
        public.is_platform_admin()
        OR c.company_id = v_company_id
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_CLASSIFICATION_CLIENT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  -- Serialize requests by client while preserving client -> 1:N projects.
  PERFORM pg_advisory_xact_lock(hashtext(p_client_id::text));

  SELECT m.project_id, p.project_code, p.project_classification
    INTO v_existing_project_id, v_project_code, v_existing_classification
  FROM public.primary_engineering_project_mappings AS m
  JOIN public.projects AS p
    ON p.id = m.project_id
   AND p.client_id = m.client_id
  WHERE m.client_id = p_client_id;

  IF FOUND THEN
    -- A legacy NULL classification remains untouched. It requires a later
    -- controlled reclassification/backfill procedure, never a Sales retry.
    IF v_existing_classification IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROJECT_CLASSIFICATION_LEGACY_UNCLASSIFIED';
    END IF;

    IF v_existing_classification <> p_project_classification THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROJECT_CLASSIFICATION_IMMUTABLE';
    END IF;

    RETURN QUERY
    SELECT v_existing_project_id, p_client_id, v_project_code, v_existing_classification;
    RETURN;
  END IF;

  v_calendar_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;

  -- Atomic annual project-code allocation. Never use MAX()+1 and never accept
  -- browser-supplied project ID/code/classification persistence outside this RPC.
  <<allocate_project_identity>>
  LOOP
    LOOP
      SELECT s.last_value
        INTO v_sequence_value
      FROM public.project_code_year_sequences AS s
      WHERE s.calendar_year = v_calendar_year
      FOR UPDATE;

      IF FOUND THEN
        IF v_sequence_value >= 999999 THEN
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROJECT_CODE_YEAR_EXHAUSTED';
        END IF;

        UPDATE public.project_code_year_sequences
        SET last_value = last_value + 1,
            updated_at = now()
        WHERE calendar_year = v_calendar_year
        RETURNING last_value INTO v_sequence_value;
        EXIT;
      END IF;

      BEGIN
        INSERT INTO public.project_code_year_sequences (calendar_year, last_value)
        VALUES (v_calendar_year, 1)
        RETURNING last_value INTO v_sequence_value;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;
    END LOOP;

    v_project_code := format('PRJ-%s-%s', v_calendar_year, lpad(v_sequence_value::text, 6, '0'));

    BEGIN
      INSERT INTO public.projects (
        project_code,
        client_id,
        name,
        project_classification
      ) VALUES (
        v_project_code,
        p_client_id,
        format('مشروع هندسي — %s', v_project_code),
        p_project_classification
      )
      RETURNING id INTO v_existing_project_id;
      EXIT allocate_project_identity;
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;

  INSERT INTO public.primary_engineering_project_mappings (
    client_id,
    project_id
  ) VALUES (
    p_client_id,
    v_existing_project_id
  );

  RETURN QUERY
  SELECT v_existing_project_id, p_client_id, v_project_code, p_project_classification;
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_resolve_classified_engineering_project_for_client(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_or_resolve_classified_engineering_project_for_client(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_or_resolve_classified_engineering_project_for_client(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.create_or_resolve_classified_engineering_project_for_client(uuid, text) IS
  'Creates or resolves a tenant-owned primary engineering project with explicit canonical classification. Existing NULL legacy classifications are never inferred or mutated.';

COMMIT;
