-- ============================================================================
-- 045 — NFPA Code Knowledge Pipeline (additive)
-- Extends Design Intelligence knowledge/rules for multi-edition code RAG.
-- Does NOT invent NFPA numeric thresholds.
-- Does NOT create a second compliance engine.
-- Prerequisites: 025_design_intelligence, 026_engineering_rules,
--                public.current_app_company_id(), public.is_platform_admin()
-- Idempotent where practical. No tenant_memberships.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Normalized code / edition registry ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.di_code_editions (
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
  superseded_by uuid REFERENCES public.di_code_editions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  -- draft | indexed | pending_engineer_review | approved | available | active | superseded
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

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
  'Code/edition registry (NFPA-13 2025, NFPA-20, …). Platform verification stays NOT_VERIFIED_OFFICIAL until maintainers encode verified cells.';

-- ─── Project-level code edition adoption ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.di_project_code_adoptions (
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_di_project_code_adoption
  ON public.di_project_code_adoptions (client_id, code)
  WHERE deleted_at IS NULL AND adoption_status = 'PROJECT_ADOPTED';

CREATE INDEX IF NOT EXISTS idx_di_project_code_adoptions_company
  ON public.di_project_code_adoptions (company_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.di_project_code_adoptions IS
  'Per-project adopted code edition. Newer editions never auto-activate. Historical results stay on adopted edition.';

-- ─── Extend di_knowledge_documents (additive) ───────────────────────────────
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'di_knowledge_documents_code_edition_id_fkey'
  ) THEN
    ALTER TABLE public.di_knowledge_documents
      ADD CONSTRAINT di_knowledge_documents_code_edition_id_fkey
      FOREIGN KEY (code_edition_id) REFERENCES public.di_code_editions(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_di_knowledge_docs_code_edition
  ON public.di_knowledge_documents (code, edition)
  WHERE deleted_at IS NULL;

-- ─── Extend di_knowledge_chunks (source traceability) ───────────────────────
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

-- ─── Extend di_indexing_jobs (pipeline job types / statuses) ────────────────
ALTER TABLE public.di_indexing_jobs
  ADD COLUMN IF NOT EXISTS pipeline_stage text;

COMMENT ON COLUMN public.di_indexing_jobs.job_type IS
  'extract | ocr | chunk | embed | index | reindex (legacy: index/reindex/ocr still accepted)';
COMMENT ON COLUMN public.di_indexing_jobs.status IS
  'pending | queued | processing | indexed | failed | superseded (legacy: queued/running/done/failed mapped in app)';

-- ─── Extend di_engineering_rules (edition-aware, additive) ──────────────────
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

-- Edition-aware uniqueness (replace company+rule_code only)
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

-- Seed NFPA 13-2025 Phase 1 rule shells (no numeric values)
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

-- Shell rules: RULE_NOT_CONFIGURED, no set_value / numeric_* (platform global company_id NULL)
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
        verification_status, rule_status
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
        'rule_not_configured'
      );
    END IF;
  END LOOP;
END $$;

-- ─── Tenant RLS for DI knowledge / code tables (no USING true) ──────────────
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
  r record;
  has_company boolean;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '%: missing — skipped', t;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) INTO has_company;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      t
    );
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND (
          policyname = t || '_all_auth'
          OR policyname = t || '_all_anon'
          OR policyname = t || '_all'
          OR policyname LIKE '%_open%'
          OR policyname LIKE 'Allow public %'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_platform_read', t);

    IF t = 'di_engineering_rules' THEN
      -- Platform/global rows (company_id IS NULL) readable; tenant rows isolated
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id IS NULL
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_select', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
           WITH CHECK (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_insert', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )
           WITH CHECK (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_update', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_delete', t
      );
    ELSIF t = 'di_code_editions' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id IS NULL
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_select', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )
           WITH CHECK (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_write', t
      );
    ELSIF t = 'di_project_code_adoptions' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
             OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id = %I.client_id
                 AND c.company_id = public.current_app_company_id()
             )
           )
           WITH CHECK (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
             OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id = %I.client_id
                 AND c.company_id = public.current_app_company_id()
             )
           )',
        t || '_tenant', t, t, t
      );
    ELSIF has_company THEN
      -- Tenant knowledge docs/chunks/jobs — never cross companies.
      -- Platform/global (company_id IS NULL) readable when explicitly global.
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id IS NULL
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_select', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
           WITH CHECK (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_insert', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )
           WITH CHECK (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_update', t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_delete', t
      );
    END IF;

    RAISE NOTICE '%: tenant RLS applied (no USING true)', t;
  END LOOP;
END $$;

-- di_engineering_fields remains catalog (non-tenant); leave existing policies if present.
