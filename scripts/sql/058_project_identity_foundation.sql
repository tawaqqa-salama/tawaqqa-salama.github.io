-- ============================================================================
-- IDENTITY-1: Project Identity Foundation
--
-- Scope:
--   * Explicit primary engineering project mapping for client-centric engineering.
--   * Server-only, idempotent project identity resolver.
--   * Atomic global calendar-year project-code allocation: PRJ-YYYY-######.
--   * projects direct-mutation hardening; authenticated remains tenant SELECT-only.
--
-- Deliberately excluded:
--   * Production backfill, client/project route changes, UI, and canonical engineering
--     payload migration.
--   * Migration 055, 056, 057, correspondence RPCs, Stage 7, Storage, PDFs,
--     legacy Stage 6 forms, Workflow, and Business Pipeline changes.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE EXCEPTION 'IDENTITY-1 requires public.projects';
  END IF;

  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'IDENTITY-1 requires public.clients';
  END IF;

  IF to_regclass('public.project_engineering_live') IS NULL THEN
    RAISE EXCEPTION 'IDENTITY-1 requires public.project_engineering_live';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_id_client_id_key'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    RAISE EXCEPTION 'IDENTITY-1 requires projects_id_client_id_key from Migration 056';
  END IF;
END $$;

-- Global platform sequence per calendar year. The sequence is intentionally
-- server-owned; neither project_id nor project_code may be supplied by a browser.
CREATE TABLE public.project_code_year_sequences (
  calendar_year integer PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_code_year_sequences_year_check
    CHECK (calendar_year BETWEEN 2000 AND 9999),
  CONSTRAINT project_code_year_sequences_last_value_check
    CHECK (last_value BETWEEN 0 AND 999999)
);

-- A client may own many projects. This mapping identifies exactly one of them as
-- the project identity for the existing client-keyed engineering file.
CREATE TABLE public.primary_engineering_project_mappings (
  client_id uuid PRIMARY KEY,
  project_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT primary_engineering_project_mappings_client_fk
    FOREIGN KEY (client_id)
    REFERENCES public.clients(id)
    ON DELETE CASCADE,
  CONSTRAINT primary_engineering_project_mappings_project_client_fk
    FOREIGN KEY (project_id, client_id)
    REFERENCES public.projects(id, client_id)
    ON DELETE RESTRICT
);

-- The approved project-code format is global. There are no existing projects in
-- Production, so the invariant can be enforced before any identity is created.
ALTER TABLE public.projects
  ADD CONSTRAINT projects_project_code_format_check
    CHECK (project_code ~ '^PRJ-[0-9]{4}-[0-9]{6}$');

-- No browser may mutate project identity directly. Reads remain tenant-scoped.
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.projects FROM authenticated;
GRANT SELECT ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

DROP POLICY IF EXISTS projects_delete_own_company ON public.projects;
DROP POLICY IF EXISTS projects_insert_own_company ON public.projects;
DROP POLICY IF EXISTS projects_select_own_company ON public.projects;
DROP POLICY IF EXISTS projects_tenant_via_client ON public.projects;
DROP POLICY IF EXISTS projects_update_own_company ON public.projects;

CREATE POLICY projects_tenant_select
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clients AS c
      WHERE c.id = projects.client_id
        AND c.company_id = public.current_app_company_id()
    )
  );

ALTER TABLE public.project_code_year_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_code_year_sequences FROM anon;
REVOKE ALL ON public.project_code_year_sequences FROM authenticated;
GRANT ALL ON public.project_code_year_sequences TO service_role;

ALTER TABLE public.primary_engineering_project_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.primary_engineering_project_mappings FROM anon;
REVOKE ALL ON public.primary_engineering_project_mappings FROM authenticated;
GRANT SELECT ON public.primary_engineering_project_mappings TO authenticated;
GRANT ALL ON public.primary_engineering_project_mappings TO service_role;

CREATE POLICY primary_engineering_project_mappings_tenant_select
  ON public.primary_engineering_project_mappings
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clients AS c
      WHERE c.id = primary_engineering_project_mappings.client_id
        AND c.company_id = public.current_app_company_id()
    )
  );

CREATE OR REPLACE FUNCTION public.ensure_or_resolve_engineering_project_for_client(
  p_client_id uuid
)
RETURNS TABLE (
  project_id uuid,
  client_id uuid,
  project_code text
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_IDENTITY_ACCESS_DENIED';
  END IF;

  IF p_client_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROJECT_IDENTITY_CLIENT_REQUIRED';
  END IF;

  v_company_id := public.current_app_company_id();
  IF NOT public.is_platform_admin() AND v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_IDENTITY_ACCESS_DENIED';
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
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PROJECT_IDENTITY_CLIENT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  -- Serialize resolver calls for the same client. This prevents duplicate primary
  -- mappings without imposing UNIQUE(projects.client_id), preserving client -> 1:N projects.
  PERFORM pg_advisory_xact_lock(hashtext(p_client_id::text));

  SELECT m.project_id, p.project_code
    INTO v_existing_project_id, v_project_code
  FROM public.primary_engineering_project_mappings AS m
  JOIN public.projects AS p
    ON p.id = m.project_id
   AND p.client_id = m.client_id
  WHERE m.client_id = p_client_id;

  IF FOUND THEN
    RETURN QUERY
    SELECT v_existing_project_id, p_client_id, v_project_code;
    RETURN;
  END IF;

  -- Only a client with canonical engineering state may receive a primary
  -- engineering project identity. Leads and arbitrary clients fail closed.
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_engineering_live AS pel
    WHERE pel.client_id = p_client_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROJECT_IDENTITY_ENGINEERING_STATE_REQUIRED';
  END IF;

  v_calendar_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer;

  -- Allocate global annual numbers without MAX()+1. A concurrent first allocation
  -- retries against the row created by the winning transaction. An unlikely external
  -- service-role code collision consumes the candidate and retries safely.
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
          -- Another transaction created this year row; lock and advance it above.
          NULL;
      END;
    END LOOP;

    v_project_code := format('PRJ-%s-%s', v_calendar_year, lpad(v_sequence_value::text, 6, '0'));

    BEGIN
      INSERT INTO public.projects (
        project_code,
        client_id,
        name
      ) VALUES (
        v_project_code,
        p_client_id,
        format('مشروع هندسي — %s', v_project_code)
      )
      RETURNING id INTO v_existing_project_id;
      EXIT allocate_project_identity;
    EXCEPTION
      WHEN unique_violation THEN
        -- project_code is global; preserve the collision-free invariant and retry.
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
  SELECT v_existing_project_id, p_client_id, v_project_code;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_or_resolve_engineering_project_for_client(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_or_resolve_engineering_project_for_client(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_or_resolve_engineering_project_for_client(uuid) TO authenticated;

COMMENT ON TABLE public.primary_engineering_project_mappings IS
  'IDENTITY-1 explicit mapping from the client-keyed engineering file to exactly one primary engineering project. It preserves client -> 1:N projects.';

COMMENT ON TABLE public.project_code_year_sequences IS
  'IDENTITY-1 server-only global platform project-code counter, reset per calendar year.';

COMMENT ON FUNCTION public.ensure_or_resolve_engineering_project_for_client(uuid) IS
  'IDENTITY-1: resolves an existing primary engineering project or atomically creates one only for a tenant-owned client with canonical engineering state. Returns the canonical project/client pair without accepting browser project_id or project_code.';

COMMIT;
