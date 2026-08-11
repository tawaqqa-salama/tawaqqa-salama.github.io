-- 045_design_intelligence_tenant_rls.sql
-- Confirmed P0: scripts/sql/025_design_intelligence.sql created open
-- authenticated/anon FOR ALL USING (true) policies on di_* tables.
-- 041_production_security_hardening.sql did not include di_* tables.
-- This migration revokes open access and applies company_id tenant policies.

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
    'di_notifications'
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
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    -- Drop legacy open policies from 025 (names vary: di_*_authenticated_all / di_*_anon_all)
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

    IF has_company THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
           USING (company_id = public.current_app_company_id())
           WITH CHECK (company_id = public.current_app_company_id())',
        t || '_tenant',
        t
      );
    ELSE
      -- Tables without company_id: deny by default (no open policy)
      NULL;
    END IF;
  END LOOP;
END $$;

COMMIT;
