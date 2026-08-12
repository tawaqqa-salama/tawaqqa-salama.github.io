-- ============================================================================
-- Close leftover open policies from final audit
-- Seen in prod: Allow public % on facilities + journal_entry_lines,
-- plus *_all policies (e.g. safety_systems_all).
-- Also drops ANY remaining Allow public % / USING(true) *_all in public|storage.
-- Then ensures schema-aware tenant policies on affected tables.
-- Prerequisites: current_app_company_id(), is_platform_admin()
-- Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_stamp_company_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_app_company_id();
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 1) Drop all leftover open policies ──────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (
        policyname LIKE 'Allow public %'
        OR (
          policyname LIKE '%_all'
          AND COALESCE(qual, '') IN ('true', '(true)')
        )
        OR COALESCE(qual, '') IN ('true', '(true)')
        OR COALESCE(with_check, '') IN ('true', '(true)')
      )
  LOOP
    -- Keep storage tenant policies (they are not open)
    IF r.schemaname = 'storage' AND r.policyname LIKE 'project_files_tenant_%' THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
    RAISE NOTICE 'dropped open policy %.%.%', r.schemaname, r.tablename, r.policyname;
  END LOOP;
END $$;

-- ─── 2) Re-apply tenant policies for known leftover tables ───────────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'facilities',
    'journal_entry_lines',
    'safety_systems',
    'equipment',
    'buildings',
    'floors',
    'zones',
    'rooms',
    'site_visits',
    'visit_notes',
    'documents',
    'attachments',
    'photos',
    'ai_messages',
    'ai_suggestions',
    'ai_model_usage_log',
    'record_versions',
    'audit_logs',
    'archive_policies',
    'ref_cities',
    'ref_regions',
    'ref_activity_types',
    'ref_building_types',
    'ref_units',
    'ref_manufacturers'
  ];
  has_company_id boolean;
  has_client_id boolean;
  has_user_id boolean;
  has_project_id boolean;
  je_has_client_id boolean;
  r record;
  has_tenant_pol boolean;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) INTO has_company_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'client_id'
    ) INTO has_client_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
    ) INTO has_user_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'project_id'
    ) INTO has_project_id;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      t
    );
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    -- Drop prior hardening policy names so recreate is clean
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND (
          policyname LIKE 'Allow public %'
          OR policyname = t || '_all'
          OR policyname = t || '_tenant'
          OR policyname = t || '_tenant_isolation'
          OR policyname = t || '_tenant_via_client'
          OR policyname = t || '_tenant_via_user'
          OR policyname = t || '_tenant_via_project'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    -- Special case: journal_entry_lines via journal_entries.client_id
    IF t = 'journal_entry_lines' THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'journal_entries'
          AND column_name = 'client_id'
      ) INTO je_has_client_id;

      IF je_has_client_id THEN
        CREATE POLICY journal_entry_lines_tenant ON public.journal_entry_lines
          FOR ALL TO authenticated
          USING (
            public.is_platform_admin()
            OR EXISTS (
              SELECT 1 FROM public.journal_entries j
              JOIN public.clients c ON c.id::text = j.client_id::text
              WHERE j.id = journal_entry_lines.journal_entry_id
                AND c.company_id = public.current_app_company_id()
            )
          )
          WITH CHECK (
            public.is_platform_admin()
            OR EXISTS (
              SELECT 1 FROM public.journal_entries j
              JOIN public.clients c ON c.id::text = j.client_id::text
              WHERE j.id = journal_entry_lines.journal_entry_id
                AND c.company_id = public.current_app_company_id()
            )
          );
        RAISE NOTICE 'journal_entry_lines: tenant via journal client_id (Allow public dropped)';
      ELSE
        CREATE POLICY journal_entry_lines_tenant ON public.journal_entry_lines
          FOR ALL TO authenticated
          USING (public.is_platform_admin())
          WITH CHECK (public.is_platform_admin());
        RAISE NOTICE 'journal_entry_lines: platform admin only';
      END IF;
      CONTINUE;
    END IF;

    IF has_company_id THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_company_id ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_stamp_company_id
           BEFORE INSERT OR UPDATE ON public.%I
           FOR EACH ROW
           EXECUTE PROCEDURE public.tg_stamp_company_id()',
        t
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )
           WITH CHECK (
             public.is_platform_admin()
             OR company_id = public.current_app_company_id()
           )',
        t || '_tenant_isolation', t
      );
      RAISE NOTICE '%: company_id tenant isolation', t;

    ELSIF has_client_id THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (
             public.is_platform_admin()
             OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             )
           )
           WITH CHECK (
             public.is_platform_admin()
             OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             )
           )',
        t || '_tenant_via_client', t, t, t
      );
      RAISE NOTICE '%: via client_id', t;

    ELSIF has_project_id AND to_regclass('public.projects') IS NOT NULL THEN
      -- Scope via projects.client_id → clients (prod projects often lack company_id)
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (
             public.is_platform_admin()
             OR EXISTS (
               SELECT 1
               FROM public.projects p
               JOIN public.clients c ON c.id = p.client_id
               WHERE p.id = %I.project_id
                 AND c.company_id = public.current_app_company_id()
             )
           )
           WITH CHECK (
             public.is_platform_admin()
             OR EXISTS (
               SELECT 1
               FROM public.projects p
               JOIN public.clients c ON c.id = p.client_id
               WHERE p.id = %I.project_id
                 AND c.company_id = public.current_app_company_id()
             )
           )',
        t || '_tenant_via_project', t, t, t
      );
      RAISE NOTICE '%: via project → client', t;

    ELSIF has_user_id THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (
             public.is_platform_admin()
             OR EXISTS (
               SELECT 1 FROM public.users u
               WHERE u.id = %I.user_id
                 AND u.company_id = public.current_app_company_id()
             )
           )
           WITH CHECK (
             public.is_platform_admin()
             OR EXISTS (
               SELECT 1 FROM public.users u
               WHERE u.id = %I.user_id
                 AND u.company_id = public.current_app_company_id()
             )
           )',
        t || '_tenant_via_user', t, t, t
      );
      RAISE NOTICE '%: via user_id', t;

    ELSE
      -- Reference/catalog tables with no tenant key: authenticated read-only,
      -- writes platform admin only — OR lock fully to platform admin.
      -- Safer default: platform admin for ALL (ref_* can be opened later).
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           FOR ALL TO authenticated
           USING (public.is_platform_admin())
           WITH CHECK (public.is_platform_admin())',
        t || '_tenant_isolation', t
      );
      RAISE NOTICE '%: no tenant key — platform admin only', t;
    END IF;
  END LOOP;
END $$;

-- ─── 3) Re-audit ─────────────────────────────────────────────────────────────
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
  AND (
    policyname LIKE 'Allow public %'
    OR policyname LIKE '%_all'
    OR policyname LIKE '%_open%'
    OR COALESCE(qual, '') IN ('true', '(true)')
    OR COALESCE(with_check, '') IN ('true', '(true)')
  )
ORDER BY schemaname, tablename, policyname;
