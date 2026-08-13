-- 045_design_intelligence_tenant_rls.sql
-- Confirmed P0: scripts/sql/025_design_intelligence.sql and
-- scripts/sql/026_engineering_rules.sql created open
-- authenticated/anon FOR ALL USING (true) policies on di_* tables.
-- 041_production_security_hardening.sql did not include di_* tables.
-- This migration revokes open access and applies tenant-safe policies.
--
-- HARD RULE: never recreate di_* policies with USING (true).

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'di_knowledge_documents',
    'di_knowledge_chunks',
    'di_indexing_jobs',
    'di_design_workspaces',
    'di_design_tasks',
    'di_design_checklists',
    'di_lessons_learned',
    'di_notifications',
    'di_engineering_fields',
    'di_engineering_rules'
  ];
  pol record;
  has_company boolean;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);

    -- Drop ALL legacy open policies (025/026 names: *_all_auth / *_all_anon, etc.)
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) INTO has_company;

    IF t = 'di_engineering_fields' THEN
      -- Global catalog (no company_id): authenticated read-only; no anon; no open ALL
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_active = true)',
        t || '_authenticated_select',
        t
      );
      CONTINUE;
    END IF;

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    IF has_company THEN
      IF t = 'di_engineering_rules' THEN
        -- Platform rows (company_id IS NULL) readable; writes must bind to session tenant
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
             USING (company_id IS NULL OR company_id = public.current_app_company_id())',
          t || '_tenant_select',
          t
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
             WITH CHECK (company_id = public.current_app_company_id())',
          t || '_tenant_insert',
          t
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
             USING (company_id = public.current_app_company_id())
             WITH CHECK (company_id = public.current_app_company_id())',
          t || '_tenant_update',
          t
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
             USING (company_id = public.current_app_company_id())',
          t || '_tenant_delete',
          t
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
             USING (company_id = public.current_app_company_id())
             WITH CHECK (company_id = public.current_app_company_id())',
          t || '_tenant',
          t
        );
      END IF;
    ELSE
      -- No company_id and not the fields catalog: deny by default (no open policy)
      NULL;
    END IF;
  END LOOP;
END $$;

COMMIT;
