-- ============================================================================
-- 046 — NFPA Code Knowledge Pipeline REPAIR (idempotent / safe re-run)
--
-- WHY THIS EXISTS
-- ---------------
-- Do NOT re-run scripts/sql/045_nfpa_code_knowledge_pipeline.sql against
-- production. A prior 045 attempt failed because it unconditionally
-- CREATE POLICY'd names that already exist from:
--   20260812_design_intelligence_tenant_rls
-- specifically:
--   di_engineering_rules_tenant_insert
--
-- 045 also DROPped only a subset of tenant policy names before CREATE,
-- so re-running it is unsafe against a partially-applied / pre-RLS state.
--
-- THIS MIGRATION
-- --------------
-- Completes the NFPA Code Knowledge Pipeline schema against the CURRENT
-- Design Intelligence base (tables + tenant RLS already present).
--
-- Safe if:
--   - 045 never ran
--   - 045 failed mid-way
--   - 045 partially applied columns/tables
--   - DI tenant RLS already exists
--
-- Rules:
--   - CREATE TABLE only when missing
--   - ADD COLUMN IF NOT EXISTS only
--   - CREATE POLICY only when missing
--   - DROP POLICY only for known OPEN / unsafe legacy policies
--   - NEVER drop valid tenant isolation policies just to recreate them
--   - NEVER invent numeric NFPA thresholds
--   - NEVER modify unrelated tables
--   - No tenant_memberships / alternate resolvers
--
-- Prerequisites (already in production):
--   di_knowledge_documents / chunks / indexing_jobs / workspaces / …
--   di_engineering_fields / di_engineering_rules
--   public.current_app_company_id()
--   public.is_platform_admin()
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) Helpers (session-local)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION pg_temp.policy_exists(p_table text, p_policy text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = p_table
      AND policyname = p_policy
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.table_exists(p_table text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT to_regclass('public.' || p_table) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION pg_temp.column_exists(p_table text, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  );
$$;

-- Drop ONLY known open/unsafe legacy DI policies. Never drop *_tenant_*.
CREATE OR REPLACE FUNCTION pg_temp.drop_open_di_policies(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  IF NOT pg_temp.table_exists(p_table) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = p_table
      AND (
        policyname = p_table || '_all_auth'
        OR policyname = p_table || '_all_anon'
        OR policyname = p_table || '_all'
        OR policyname LIKE '%_open%'
        OR policyname LIKE 'Allow public %'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, p_table);
    RAISE NOTICE 'Dropped open/legacy policy %.% ', p_table, r.policyname;
  END LOOP;
END;
$$;

-- Create a policy only when missing (never CREATE blindly).
CREATE OR REPLACE FUNCTION pg_temp.ensure_policy(
  p_table text,
  p_policy text,
  p_sql text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT pg_temp.table_exists(p_table) THEN
    RAISE NOTICE 'ensure_policy skipped — table % missing', p_table;
    RETURN;
  END IF;

  IF pg_temp.policy_exists(p_table, p_policy) THEN
    RAISE NOTICE 'Policy %.% already exists — left untouched', p_table, p_policy;
    RETURN;
  END IF;

  EXECUTE p_sql;
  RAISE NOTICE 'Created policy %.%', p_table, p_policy;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) di_code_editions (create only if missing)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF pg_temp.table_exists('di_code_editions') THEN
    RAISE NOTICE 'di_code_editions already exists — reuse';
  ELSE
    CREATE TABLE public.di_code_editions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
      code text NOT NULL,
      edition text NOT NULL,
      title text,
      adoption_status text NOT NULL DEFAULT 'NOT_ADOPTED',
      verification_status text NOT NULL DEFAULT 'UNVERIFIED',
      platform_verification_status text NOT NULL DEFAULT 'NOT_VERIFIED_OFFICIAL',
      source_type text,
      source_document_id text,
      knowledge_document_id uuid REFERENCES public.di_knowledge_documents(id) ON DELETE SET NULL,
      effective_from date,
      effective_to date,
      superseded_by uuid,
      status text NOT NULL DEFAULT 'draft',
      notes text,
      created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    RAISE NOTICE 'Created table di_code_editions';
  END IF;
END $$;

-- Self-FK for superseded_by (additive; only if missing)
DO $$
BEGIN
  IF pg_temp.table_exists('di_code_editions')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'di_code_editions_superseded_by_fkey'
     )
  THEN
    ALTER TABLE public.di_code_editions
      ADD CONSTRAINT di_code_editions_superseded_by_fkey
      FOREIGN KEY (superseded_by) REFERENCES public.di_code_editions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_di_code_editions_identity
  ON public.di_code_editions (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    code,
    edition
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_di_code_editions_code
  ON public.di_code_editions (code, edition)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.di_code_editions IS
  'Code/edition registry (NFPA-13 2025/2028/…, NFPA-20, …). Global rows may use company_id NULL. platform_verification_status stays NOT_VERIFIED_OFFICIAL until maintainers encode verified cells.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) di_project_code_adoptions (create only if missing)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF pg_temp.table_exists('di_project_code_adoptions') THEN
    RAISE NOTICE 'di_project_code_adoptions already exists — reuse';
  ELSE
    CREATE TABLE public.di_project_code_adoptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
      client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
      code text NOT NULL,
      edition text NOT NULL,
      code_edition_id uuid REFERENCES public.di_code_editions(id) ON DELETE SET NULL,
      title text,
      adoption_status text NOT NULL DEFAULT 'PROJECT_ADOPTED',
      source_type text NOT NULL DEFAULT 'PROJECT_PROVIDED_DOCUMENT',
      source_document_id text NOT NULL,
      verification_status text NOT NULL DEFAULT 'PROJECT_COVER_IDENTIFIED',
      platform_verification_status text NOT NULL DEFAULT 'NOT_VERIFIED_OFFICIAL',
      knowledge_document_id uuid REFERENCES public.di_knowledge_documents(id) ON DELETE SET NULL,
      adopted_at timestamptz NOT NULL DEFAULT now(),
      notes text,
      created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    RAISE NOTICE 'Created table di_project_code_adoptions';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_di_project_code_adoption
  ON public.di_project_code_adoptions (client_id, code)
  WHERE deleted_at IS NULL AND adoption_status = 'PROJECT_ADOPTED';

CREATE INDEX IF NOT EXISTS idx_di_project_code_adoptions_company
  ON public.di_project_code_adoptions (company_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.di_project_code_adoptions IS
  'Per-project adopted code edition. Newer editions never auto-activate. Historical results stay on adopted edition.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Extend existing DI knowledge / rules tables (additive columns only)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT pg_temp.table_exists('di_knowledge_documents') THEN
    RAISE EXCEPTION 'di_knowledge_documents missing — base DI schema required before 046';
  END IF;
  IF NOT pg_temp.table_exists('di_knowledge_chunks') THEN
    RAISE EXCEPTION 'di_knowledge_chunks missing — base DI schema required before 046';
  END IF;
  IF NOT pg_temp.table_exists('di_indexing_jobs') THEN
    RAISE EXCEPTION 'di_indexing_jobs missing — base DI schema required before 046';
  END IF;
  IF NOT pg_temp.table_exists('di_engineering_rules') THEN
    RAISE EXCEPTION 'di_engineering_rules missing — base DI schema required before 046';
  END IF;
  IF NOT pg_temp.table_exists('di_engineering_fields') THEN
    RAISE EXCEPTION 'di_engineering_fields missing — base DI schema required before 046';
  END IF;
END $$;

ALTER TABLE public.di_knowledge_documents
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS edition text,
  ADD COLUMN IF NOT EXISTS version text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS adoption_status text,
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS platform_verification_status text DEFAULT 'NOT_VERIFIED_OFFICIAL',
  ADD COLUMN IF NOT EXISTS source_document_id text,
  ADD COLUMN IF NOT EXISTS code_edition_id uuid,
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS extract_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ocr_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS embedding_status text DEFAULT 'pending';

DO $$
BEGIN
  IF pg_temp.column_exists('di_knowledge_documents', 'code_edition_id')
     AND pg_temp.table_exists('di_code_editions')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'di_knowledge_documents_code_edition_id_fkey'
     )
  THEN
    ALTER TABLE public.di_knowledge_documents
      ADD CONSTRAINT di_knowledge_documents_code_edition_id_fkey
      FOREIGN KEY (code_edition_id) REFERENCES public.di_code_editions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_di_knowledge_docs_code_edition
  ON public.di_knowledge_documents (code, edition)
  WHERE deleted_at IS NULL;

ALTER TABLE public.di_knowledge_chunks
  ADD COLUMN IF NOT EXISTS edition text,
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS subsection text,
  ADD COLUMN IF NOT EXISTS table_reference text,
  ADD COLUMN IF NOT EXISTS figure_reference text,
  ADD COLUMN IF NOT EXISTS paragraph_reference text,
  ADD COLUMN IF NOT EXISTS source_document_id text,
  ADD COLUMN IF NOT EXISTS source_verification_status text DEFAULT 'NOT_VERIFIED',
  ADD COLUMN IF NOT EXISTS code text;

CREATE INDEX IF NOT EXISTS idx_di_chunks_code_edition
  ON public.di_knowledge_chunks (code, edition);

CREATE INDEX IF NOT EXISTS idx_di_chunks_company
  ON public.di_knowledge_chunks (company_id);

ALTER TABLE public.di_indexing_jobs
  ADD COLUMN IF NOT EXISTS pipeline_stage text;

COMMENT ON COLUMN public.di_indexing_jobs.job_type IS
  'extract | ocr | chunk | embed | index | reindex (legacy: index/reindex/ocr still accepted)';
COMMENT ON COLUMN public.di_indexing_jobs.status IS
  'pending | queued | processing | indexed | failed | superseded (legacy: queued/running/done/failed mapped in app)';

ALTER TABLE public.di_engineering_rules
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS edition text,
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS table_reference text,
  ADD COLUMN IF NOT EXISTS figure_reference text,
  ADD COLUMN IF NOT EXISTS source_document_id text,
  ADD COLUMN IF NOT EXISTS applicability jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS input_fields text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS output_fields text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS numeric_value numeric,
  ADD COLUMN IF NOT EXISTS numeric_min numeric,
  ADD COLUMN IF NOT EXISTS numeric_max numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'RULE_NOT_CONFIGURED',
  ADD COLUMN IF NOT EXISTS rule_status text DEFAULT 'rule_not_configured',
  ADD COLUMN IF NOT EXISTS parent_rule_id uuid,
  ADD COLUMN IF NOT EXISTS superseded_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'di_engineering_rules_parent_rule_id_fkey'
  ) THEN
    ALTER TABLE public.di_engineering_rules
      ADD CONSTRAINT di_engineering_rules_parent_rule_id_fkey
      FOREIGN KEY (parent_rule_id) REFERENCES public.di_engineering_rules(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'di_engineering_rules_superseded_by_fkey'
  ) THEN
    ALTER TABLE public.di_engineering_rules
      ADD CONSTRAINT di_engineering_rules_superseded_by_fkey
      FOREIGN KEY (superseded_by) REFERENCES public.di_engineering_rules(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Edition-aware uniqueness: drop ONLY the old non-edition unique index if present.
-- Do not touch other indexes. Safe when the edition-aware index already exists.
DROP INDEX IF EXISTS public.uq_di_eng_rules_tenant_code;
CREATE UNIQUE INDEX IF NOT EXISTS uq_di_eng_rules_tenant_code_edition
  ON public.di_engineering_rules (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rule_code,
    COALESCE(code, ''),
    COALESCE(edition, '')
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_di_eng_rules_code_edition
  ON public.di_engineering_rules (code, edition)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.di_engineering_rules.verification_status IS
  'RULE_NOT_CONFIGURED until exact section/table verified — never invent numeric NFPA values';
COMMENT ON COLUMN public.di_engineering_rules.rule_status IS
  'active | superseded | draft | rule_not_configured';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Field catalog + RULE_NOT_CONFIGURED shells (no numeric values)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.di_engineering_fields (field_key, label_en, label_ar, value_kind, depends_on, cascade_order)
VALUES
  ('nfpa13_occ_hazard', 'NFPA 13 Occupancy Hazard', 'تصنيف خطورة NFPA 13', 'select', '{}', 200),
  ('nfpa13_sprinkler_type', 'NFPA 13 Sprinkler Type', 'نوع الرشاش NFPA 13', 'select', ARRAY['nfpa13_occ_hazard'], 210),
  ('nfpa13_system_type', 'NFPA 13 System Type', 'نوع النظام NFPA 13', 'select', ARRAY['nfpa13_occ_hazard'], 220),
  ('nfpa13_k_factor', 'NFPA 13 K-Factor', 'معامل K NFPA 13', 'computed', ARRAY['nfpa13_sprinkler_type'], 230),
  ('nfpa13_design_area', 'NFPA 13 Design Area', 'مساحة التصميم NFPA 13', 'computed', ARRAY['nfpa13_occ_hazard'], 240),
  ('nfpa13_density', 'NFPA 13 Density', 'الكثافة NFPA 13', 'computed', ARRAY['nfpa13_occ_hazard'], 250),
  ('nfpa13_spacing', 'NFPA 13 Spacing', 'التباعد NFPA 13', 'computed', ARRAY['nfpa13_sprinkler_type'], 260),
  ('nfpa13_max_coverage', 'NFPA 13 Max Coverage', 'أقصى تغطية NFPA 13', 'computed', ARRAY['nfpa13_sprinkler_type'], 270)
ON CONFLICT (field_key) DO UPDATE SET
  label_en = EXCLUDED.label_en,
  label_ar = EXCLUDED.label_ar,
  updated_at = now();

DO $$
DECLARE
  r record;
  shells jsonb := '[
    {"rule_code":"NFPA13-OCC-HAZARD","field_key":"nfpa13_occ_hazard","en":"Hazard classification — section/table not verified from source → RULE_NOT_CONFIGURED.","ar":"تصنيف الخطورة — القسم/الجدول غير مُتحقَّق → RULE_NOT_CONFIGURED."},
    {"rule_code":"NFPA13-SPRINKLER-TYPE","field_key":"nfpa13_sprinkler_type","en":"Sprinkler type — RULE_NOT_CONFIGURED until section/table verified.","ar":"نوع الرشاش — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول."},
    {"rule_code":"NFPA13-SYSTEM-TYPE","field_key":"nfpa13_system_type","en":"System type — RULE_NOT_CONFIGURED until section/table verified.","ar":"نوع النظام — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول."},
    {"rule_code":"NFPA13-K-FACTOR","field_key":"nfpa13_k_factor","en":"K-factor — RULE_NOT_CONFIGURED until section/table verified.","ar":"معامل K — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول."},
    {"rule_code":"NFPA13-DESIGN-AREA","field_key":"nfpa13_design_area","en":"Design area — RULE_NOT_CONFIGURED until section/table verified.","ar":"مساحة التصميم — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول."},
    {"rule_code":"NFPA13-DENSITY","field_key":"nfpa13_density","en":"Density — RULE_NOT_CONFIGURED (no invented values).","ar":"الكثافة — RULE_NOT_CONFIGURED (لا اختراع قيم)."},
    {"rule_code":"NFPA13-SPACING","field_key":"nfpa13_spacing","en":"Spacing — RULE_NOT_CONFIGURED until section/table verified.","ar":"التباعد — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول."},
    {"rule_code":"NFPA13-MAX-COVERAGE","field_key":"nfpa13_max_coverage","en":"Max coverage — RULE_NOT_CONFIGURED until section/table verified.","ar":"أقصى تغطية — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول."}
  ]'::jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(shells) AS x(item)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.di_engineering_rules
      WHERE company_id IS NULL
        AND rule_code = r.item->>'rule_code'
        AND COALESCE(code, '') = 'NFPA-13'
        AND COALESCE(edition, '') = '2025'
        AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.di_engineering_rules (
        company_id, rule_code, field_key, when_conditions,
        explanation_en, explanation_ar, code_refs, priority, version_label,
        is_active, code, edition, source_document_id,
        verification_status, rule_status,
        numeric_value, numeric_min, numeric_max, unit
      ) VALUES (
        NULL,
        r.item->>'rule_code',
        r.item->>'field_key',
        '{}'::jsonb,
        r.item->>'en',
        r.item->>'ar',
        ARRAY['NFPA-13:2025'],
        100,
        '2025.0',
        false,
        'NFPA-13',
        '2025',
        'project_provided:NFPA-13-2025-cover',
        'RULE_NOT_CONFIGURED',
        'rule_not_configured',
        NULL,
        NULL,
        NULL,
        NULL
      );
      RAISE NOTICE 'Seeded RULE_NOT_CONFIGURED shell %', r.item->>'rule_code';
    ELSE
      RAISE NOTICE 'Shell % already present — left untouched (no numeric overwrite)', r.item->>'rule_code';
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) RLS — enable + grants; drop open policies only; create missing tenant policies
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'di_knowledge_documents',
    'di_knowledge_chunks',
    'di_indexing_jobs',
    'di_code_editions',
    'di_project_code_adoptions',
    'di_engineering_rules'
  ];
BEGIN
  -- Fail fast if tenant resolver missing (do not invent alternate resolver)
  IF to_regprocedure('public.current_app_company_id()') IS NULL THEN
    RAISE EXCEPTION 'public.current_app_company_id() missing — apply tenant resolver before 046';
  END IF;
  IF to_regprocedure('public.is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION 'public.is_platform_admin() missing — apply platform admin helper before 046';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF NOT pg_temp.table_exists(t) THEN
      RAISE NOTICE '% missing — skipped RLS block', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      t
    );
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    PERFORM pg_temp.drop_open_di_policies(t);
  END LOOP;
END $$;

-- ── di_engineering_rules: create ONLY missing tenant policies ───────────────
-- Existing correct policy di_engineering_rules_tenant_insert is left untouched.
SELECT pg_temp.ensure_policy(
  'di_engineering_rules',
  'di_engineering_rules_tenant_select',
  $sql$
    CREATE POLICY di_engineering_rules_tenant_select ON public.di_engineering_rules
      FOR SELECT TO authenticated
      USING (
        public.is_platform_admin()
        OR company_id IS NULL
        OR company_id = public.current_app_company_id()
      )
  $sql$
);

SELECT pg_temp.ensure_policy(
  'di_engineering_rules',
  'di_engineering_rules_tenant_insert',
  $sql$
    CREATE POLICY di_engineering_rules_tenant_insert ON public.di_engineering_rules
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
      )
  $sql$
);

SELECT pg_temp.ensure_policy(
  'di_engineering_rules',
  'di_engineering_rules_tenant_update',
  $sql$
    CREATE POLICY di_engineering_rules_tenant_update ON public.di_engineering_rules
      FOR UPDATE TO authenticated
      USING (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
      )
      WITH CHECK (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
      )
  $sql$
);

SELECT pg_temp.ensure_policy(
  'di_engineering_rules',
  'di_engineering_rules_tenant_delete',
  $sql$
    CREATE POLICY di_engineering_rules_tenant_delete ON public.di_engineering_rules
      FOR DELETE TO authenticated
      USING (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
      )
  $sql$
);

-- ── di_code_editions: global (company_id NULL) readable; writes tenant-scoped ─
SELECT pg_temp.ensure_policy(
  'di_code_editions',
  'di_code_editions_tenant_select',
  $sql$
    CREATE POLICY di_code_editions_tenant_select ON public.di_code_editions
      FOR SELECT TO authenticated
      USING (
        public.is_platform_admin()
        OR company_id IS NULL
        OR company_id = public.current_app_company_id()
      )
  $sql$
);

-- Writes: tenant rows scoped to company; global (company_id NULL) = platform admin only.
SELECT pg_temp.ensure_policy(
  'di_code_editions',
  'di_code_editions_tenant_insert',
  $sql$
    CREATE POLICY di_code_editions_tenant_insert ON public.di_code_editions
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
      )
  $sql$
);

SELECT pg_temp.ensure_policy(
  'di_code_editions',
  'di_code_editions_tenant_update',
  $sql$
    CREATE POLICY di_code_editions_tenant_update ON public.di_code_editions
      FOR UPDATE TO authenticated
      USING (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
      )
      WITH CHECK (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
      )
  $sql$
);

SELECT pg_temp.ensure_policy(
  'di_code_editions',
  'di_code_editions_tenant_delete',
  $sql$
    CREATE POLICY di_code_editions_tenant_delete ON public.di_code_editions
      FOR DELETE TO authenticated
      USING (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
      )
  $sql$
);

-- ── di_project_code_adoptions: tenant / project scoped ──────────────────────
SELECT pg_temp.ensure_policy(
  'di_project_code_adoptions',
  'di_project_code_adoptions_tenant_select',
  $sql$
    CREATE POLICY di_project_code_adoptions_tenant_select ON public.di_project_code_adoptions
      FOR SELECT TO authenticated
      USING (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = di_project_code_adoptions.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
  $sql$
);

SELECT pg_temp.ensure_policy(
  'di_project_code_adoptions',
  'di_project_code_adoptions_tenant_insert',
  $sql$
    CREATE POLICY di_project_code_adoptions_tenant_insert ON public.di_project_code_adoptions
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = di_project_code_adoptions.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
  $sql$
);

SELECT pg_temp.ensure_policy(
  'di_project_code_adoptions',
  'di_project_code_adoptions_tenant_update',
  $sql$
    CREATE POLICY di_project_code_adoptions_tenant_update ON public.di_project_code_adoptions
      FOR UPDATE TO authenticated
      USING (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = di_project_code_adoptions.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = di_project_code_adoptions.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
  $sql$
);

SELECT pg_temp.ensure_policy(
  'di_project_code_adoptions',
  'di_project_code_adoptions_tenant_delete',
  $sql$
    CREATE POLICY di_project_code_adoptions_tenant_delete ON public.di_project_code_adoptions
      FOR DELETE TO authenticated
      USING (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = di_project_code_adoptions.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
  $sql$
);

-- ── Existing knowledge docs / chunks / jobs: fill ONLY missing tenant policies
-- Do not recreate policies that 20260812_design_intelligence_tenant_rls already installed.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'di_knowledge_documents',
    'di_knowledge_chunks',
    'di_indexing_jobs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    PERFORM pg_temp.ensure_policy(
      t,
      t || '_tenant_select',
      format(
        $sql$
          CREATE POLICY %I ON public.%I
            FOR SELECT TO authenticated
            USING (
              public.is_platform_admin()
              OR company_id IS NULL
              OR company_id = public.current_app_company_id()
            )
        $sql$,
        t || '_tenant_select', t
      )
    );

    PERFORM pg_temp.ensure_policy(
      t,
      t || '_tenant_insert',
      format(
        $sql$
          CREATE POLICY %I ON public.%I
            FOR INSERT TO authenticated
            WITH CHECK (
              public.is_platform_admin()
              OR company_id = public.current_app_company_id()
            )
        $sql$,
        t || '_tenant_insert', t
      )
    );

    PERFORM pg_temp.ensure_policy(
      t,
      t || '_tenant_update',
      format(
        $sql$
          CREATE POLICY %I ON public.%I
            FOR UPDATE TO authenticated
            USING (
              public.is_platform_admin()
              OR company_id = public.current_app_company_id()
            )
            WITH CHECK (
              public.is_platform_admin()
              OR company_id = public.current_app_company_id()
            )
        $sql$,
        t || '_tenant_update', t
      )
    );

    PERFORM pg_temp.ensure_policy(
      t,
      t || '_tenant_delete',
      format(
        $sql$
          CREATE POLICY %I ON public.%I
            FOR DELETE TO authenticated
            USING (
              public.is_platform_admin()
              OR company_id = public.current_app_company_id()
            )
        $sql$,
        t || '_tenant_delete', t
      )
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Post-apply verification (read-only NOTICES — no destructive SQL)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  missing text := '';
  pol_count int;
  shell_count int;
  active_numeric int;
BEGIN
  IF NOT pg_temp.table_exists('di_code_editions') THEN
    missing := missing || ' di_code_editions';
  END IF;
  IF NOT pg_temp.table_exists('di_project_code_adoptions') THEN
    missing := missing || ' di_project_code_adoptions';
  END IF;
  IF missing <> '' THEN
    RAISE EXCEPTION '046 verification failed — missing tables:%', missing;
  END IF;

  SELECT count(*) INTO pol_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'di_code_editions',
      'di_project_code_adoptions',
      'di_engineering_rules',
      'di_knowledge_documents',
      'di_knowledge_chunks',
      'di_indexing_jobs'
    );

  SELECT count(*) INTO shell_count
  FROM public.di_engineering_rules
  WHERE company_id IS NULL
    AND code = 'NFPA-13'
    AND edition = '2025'
    AND rule_code IN (
      'NFPA13-OCC-HAZARD',
      'NFPA13-SPRINKLER-TYPE',
      'NFPA13-SYSTEM-TYPE',
      'NFPA13-K-FACTOR',
      'NFPA13-DESIGN-AREA',
      'NFPA13-DENSITY',
      'NFPA13-SPACING',
      'NFPA13-MAX-COVERAGE'
    )
    AND deleted_at IS NULL
    AND verification_status = 'RULE_NOT_CONFIGURED';

  SELECT count(*) INTO active_numeric
  FROM public.di_engineering_rules
  WHERE company_id IS NULL
    AND code = 'NFPA-13'
    AND edition = '2025'
    AND rule_code IN (
      'NFPA13-OCC-HAZARD',
      'NFPA13-SPRINKLER-TYPE',
      'NFPA13-SYSTEM-TYPE',
      'NFPA13-K-FACTOR',
      'NFPA13-DESIGN-AREA',
      'NFPA13-DENSITY',
      'NFPA13-SPACING',
      'NFPA13-MAX-COVERAGE'
    )
    AND deleted_at IS NULL
    AND is_active = true
    AND (
      numeric_value IS NOT NULL
      OR numeric_min IS NOT NULL
      OR numeric_max IS NOT NULL
      OR set_value IS NOT NULL
    );

  RAISE NOTICE '046 OK — di_code_editions + di_project_code_adoptions present';
  RAISE NOTICE '046 OK — DI policy rows visible in pg_policies: %', pol_count;
  RAISE NOTICE '046 OK — NFPA13-2025 RULE_NOT_CONFIGURED shells: %', shell_count;
  RAISE NOTICE '046 OK — active numeric NFPA13-2025 shells (must be 0): %', active_numeric;

  IF active_numeric > 0 THEN
    RAISE EXCEPTION '046 refused — invented/active numeric NFPA shells detected (%)', active_numeric;
  END IF;
END $$;

-- Optional operator verification (run manually after apply; read-only):
--   SELECT to_regclass('public.di_code_editions'),
--          to_regclass('public.di_project_code_adoptions');
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename LIKE 'di_%'
--   ORDER BY 1,2;
--   SELECT rule_code, edition, verification_status, rule_status,
--          numeric_value, numeric_min, numeric_max, is_active
--   FROM public.di_engineering_rules
--   WHERE code='NFPA-13' AND edition='2025' AND deleted_at IS NULL;
