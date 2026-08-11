-- ============================================================================
-- 041 — Production Security Hardening
-- Additive migration: tighten RLS, Storage, live-store RPCs.
-- Does NOT drop correct existing policies; replaces open USING(true) on sensitive tables.
-- Safe to re-run.
-- ============================================================================

-- ─── 1) Stronger company resolver (membership-aware) ─────────────────────────
CREATE OR REPLACE FUNCTION public.current_app_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT u.company_id
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.deleted_at IS NULL
        AND u.is_active = true
      LIMIT 1
    ),
    (
      SELECT tm.company_id
      FROM public.tenant_memberships tm
      JOIN public.users u ON u.id = tm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.is_default = true
      LIMIT 1
    ),
    (
      SELECT tm.company_id
      FROM public.tenant_memberships tm
      JOIN public.users u ON u.id = tm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND tm.status = 'active'
      ORDER BY tm.created_at ASC
      LIMIT 1
    )
  );
$$;

REVOKE ALL ON FUNCTION public.current_app_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_company_id() TO authenticated;
-- service_role bypasses RLS; keep execute for tooling
GRANT EXECUTE ON FUNCTION public.current_app_company_id() TO service_role;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (u.is_platform_admin = true OR u.role_code = 'super_admin')
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.deleted_at IS NULL
        AND u.is_active = true
      LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- ─── 2) Helper: apply tenant ALL policies on company_id tables ───────────────
DO $$
DECLARE
  t text;
  r record;
  tables text[] := ARRAY[
    -- Core / CRM / projects (users handled separately — privilege escalation guards)
    'companies','branches','roles','clients','client_follow_ups',
    'projects','buildings','floors','zones','rooms','safety_systems','equipment',
    'site_visits','visit_notes','documents','attachments','photos',
    -- Sales / finance
    'sales_documents','sales_contracts','sales_returns',
    'chart_of_accounts','cost_centers','journal_entries','vouchers','payments',
    'zatca_invoices','zatca_retry_queue',
    'acc_fiscal_years','acc_fiscal_periods','acc_accounting_rules',
    'acc_ar_invoices','acc_ap_bills','acc_bank_accounts','acc_bank_transactions',
    'acc_fixed_assets','acc_budgets','acc_project_ledgers','acc_audit_findings',
    -- Procurement
    'procurement_vendors','purchase_orders','procurement_rfqs',
    -- WhatsApp CRM
    'whatsapp_accounts','customer_whatsapp_contacts','whatsapp_conversations',
    'crm_opportunities','whatsapp_templates','whatsapp_campaigns',
    'whatsapp_automations','whatsapp_notifications','whatsapp_lead_extractions',
    'whatsapp_attachments',
    -- Social / website / marketing
    'marketing_campaigns','social_accounts','client_social_identities',
    'social_conversations','social_posts','social_analytics_snapshots',
    'website_sites','customer_timeline_events','marketing_audit_logs',
    -- SaaS
    'tenant_modules','tenant_subscriptions','saas_audit_logs',
    -- Misc
    'activity_logs','notifications','workflow_definitions','workflow_instances',
    'ai_conversations','compliance_exceptions','knowledge_articles',
    'quotation_documents','payment_milestones'
  ];
  has_company boolean;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) INTO has_company;

    IF NOT has_company THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    -- Drop known open policies from early seeds
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND (
          policyname LIKE 'Allow public %'
          OR policyname = t || '_all'
          OR policyname LIKE '%_open%'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    -- Idempotent tenant policy (drop + recreate hardening policy only)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
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
      t || '_tenant_isolation',
      t
    );
  END LOOP;
END $$;

-- Users: prevent privilege escalation (role_code / company_id / platform flag)
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.users FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
  GRANT ALL ON public.users TO service_role;

  -- Drop open + generic policies that would OR-bypass the escalation guards
  DROP POLICY IF EXISTS "Allow public read users" ON public.users;
  DROP POLICY IF EXISTS "Allow public insert users" ON public.users;
  DROP POLICY IF EXISTS "Allow public update users" ON public.users;
  DROP POLICY IF EXISTS "Allow public delete users" ON public.users;
  DROP POLICY IF EXISTS users_tenant_isolation ON public.users;
  DROP POLICY IF EXISTS users_tenant_all ON public.users;

  DROP POLICY IF EXISTS users_select_tenant ON public.users;
  CREATE POLICY users_select_tenant ON public.users
    FOR SELECT TO authenticated
    USING (
      public.is_platform_admin()
      OR company_id = public.current_app_company_id()
      OR id = public.current_app_user_id()
    );

  DROP POLICY IF EXISTS users_insert_tenant ON public.users;
  CREATE POLICY users_insert_tenant ON public.users
    FOR INSERT TO authenticated
    WITH CHECK (
      public.is_platform_admin()
      OR company_id = public.current_app_company_id()
    );

  DROP POLICY IF EXISTS users_update_tenant ON public.users;
  CREATE POLICY users_update_tenant ON public.users
    FOR UPDATE TO authenticated
    USING (
      public.is_platform_admin()
      OR company_id = public.current_app_company_id()
    )
    WITH CHECK (
      public.is_platform_admin()
      OR company_id = public.current_app_company_id()
    );

  DROP POLICY IF EXISTS users_delete_tenant ON public.users;
  CREATE POLICY users_delete_tenant ON public.users
    FOR DELETE TO authenticated
    USING (
      public.is_platform_admin()
      OR company_id = public.current_app_company_id()
    );
END $$;

-- ─── 3) Live-store tables (no company_id) — scope via clients ────────────────
DO $$
BEGIN
  IF to_regclass('public.project_engineering_live') IS NOT NULL THEN
    ALTER TABLE public.project_engineering_live ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.project_engineering_live FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_engineering_live TO authenticated;
    GRANT ALL ON public.project_engineering_live TO service_role;

    DROP POLICY IF EXISTS project_engineering_live_all ON public.project_engineering_live;
    DROP POLICY IF EXISTS project_engineering_live_tenant ON public.project_engineering_live;
    CREATE POLICY project_engineering_live_tenant ON public.project_engineering_live
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = project_engineering_live.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = project_engineering_live.client_id
            AND c.company_id = public.current_app_company_id()
        )
      );
  END IF;

  IF to_regclass('public.project_stage4_live') IS NOT NULL THEN
    ALTER TABLE public.project_stage4_live ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.project_stage4_live FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_stage4_live TO authenticated;
    GRANT ALL ON public.project_stage4_live TO service_role;
    DROP POLICY IF EXISTS project_stage4_live_all ON public.project_stage4_live;
    DROP POLICY IF EXISTS project_stage4_live_tenant ON public.project_stage4_live;
    CREATE POLICY project_stage4_live_tenant ON public.project_stage4_live
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = project_stage4_live.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = project_stage4_live.client_id
            AND c.company_id = public.current_app_company_id()
        )
      );
  END IF;

  IF to_regclass('public.project_supervision_reports') IS NOT NULL THEN
    ALTER TABLE public.project_supervision_reports ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.project_supervision_reports FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_supervision_reports TO authenticated;
    GRANT ALL ON public.project_supervision_reports TO service_role;
    DROP POLICY IF EXISTS project_supervision_reports_all ON public.project_supervision_reports;
    DROP POLICY IF EXISTS project_supervision_reports_tenant ON public.project_supervision_reports;
    CREATE POLICY project_supervision_reports_tenant ON public.project_supervision_reports
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = project_supervision_reports.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = project_supervision_reports.client_id
            AND c.company_id = public.current_app_company_id()
        )
      );
  END IF;

  IF to_regclass('public.field_visit_reports') IS NOT NULL THEN
    ALTER TABLE public.field_visit_reports ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.field_visit_reports FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_visit_reports TO authenticated;
    GRANT ALL ON public.field_visit_reports TO service_role;
    DROP POLICY IF EXISTS field_visit_reports_all ON public.field_visit_reports;
    DROP POLICY IF EXISTS field_visit_reports_tenant ON public.field_visit_reports;
    CREATE POLICY field_visit_reports_tenant ON public.field_visit_reports
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = field_visit_reports.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = field_visit_reports.client_id
            AND c.company_id = public.current_app_company_id()
        )
      );
  END IF;

  IF to_regclass('public.report_pdf_snapshots') IS NOT NULL THEN
    ALTER TABLE public.report_pdf_snapshots ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.report_pdf_snapshots FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_pdf_snapshots TO authenticated;
    GRANT ALL ON public.report_pdf_snapshots TO service_role;
    DROP POLICY IF EXISTS report_pdf_snapshots_all ON public.report_pdf_snapshots;
    DROP POLICY IF EXISTS report_pdf_snapshots_tenant ON public.report_pdf_snapshots;
    CREATE POLICY report_pdf_snapshots_tenant ON public.report_pdf_snapshots
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = report_pdf_snapshots.client_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = report_pdf_snapshots.client_id
            AND c.company_id = public.current_app_company_id()
        )
      );
  END IF;
END $$;

-- ─── 4) Harden SECURITY DEFINER live-save RPCs ───────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_client_tenant_access(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required for live save';
  END IF;
  IF public.is_platform_admin() THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND c.company_id = public.current_app_company_id()
  ) THEN
    RAISE EXCEPTION 'tenant_isolation: client not in your company';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_client_tenant_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_client_tenant_access(uuid) TO authenticated, service_role;

-- Wrap existing live save if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_project_engineering_live'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.save_project_engineering_live(
        p_client_id uuid,
        p_payload jsonb,
        p_pipeline_stage text DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      BEGIN
        PERFORM public.assert_client_tenant_access(p_client_id);
        PERFORM set_config('statement_timeout', '60s', true);

        IF p_pipeline_stage IS NOT NULL THEN
          UPDATE public.clients
          SET pipeline_stage = p_pipeline_stage, updated_at = now()
          WHERE id = p_client_id;
        ELSE
          UPDATE public.clients SET updated_at = now() WHERE id = p_client_id;
        END IF;

        INSERT INTO public.project_engineering_live (client_id, payload, updated_at)
        VALUES (p_client_id, COALESCE(p_payload, '{}'::jsonb), now())
        ON CONFLICT (client_id) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = now();
      END;
      $body$;
    $fn$;
    REVOKE ALL ON FUNCTION public.save_project_engineering_live(uuid, jsonb, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.save_project_engineering_live(uuid, jsonb, text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.save_project_engineering_live(uuid, jsonb, text)
      TO authenticated, service_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_stage4_live_bundle'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.save_stage4_live_bundle(
        p_client_id uuid,
        p_technical_report jsonb,
        p_fire_protection_design jsonb DEFAULT '{}'::jsonb,
        p_workflow jsonb DEFAULT '{}'::jsonb,
        p_pipeline_stage text DEFAULT NULL
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      BEGIN
        PERFORM public.assert_client_tenant_access(p_client_id);
        PERFORM set_config('statement_timeout', '60s', true);

        IF p_pipeline_stage IS NOT NULL THEN
          UPDATE public.clients
          SET pipeline_stage = p_pipeline_stage, updated_at = now()
          WHERE id = p_client_id;
        ELSE
          UPDATE public.clients SET updated_at = now() WHERE id = p_client_id;
        END IF;

        INSERT INTO public.project_stage4_live (
          client_id, technical_report, fire_protection_design, workflow, updated_at
        )
        VALUES (
          p_client_id,
          COALESCE(p_technical_report, '{}'::jsonb),
          COALESCE(p_fire_protection_design, '{}'::jsonb),
          COALESCE(p_workflow, '{}'::jsonb),
          now()
        )
        ON CONFLICT (client_id) DO UPDATE SET
          technical_report = EXCLUDED.technical_report,
          fire_protection_design = EXCLUDED.fire_protection_design,
          workflow = EXCLUDED.workflow,
          updated_at = now();
      END;
      $body$;
    $fn$;
    REVOKE ALL ON FUNCTION public.save_stage4_live_bundle(uuid, jsonb, jsonb, jsonb, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.save_stage4_live_bundle(uuid, jsonb, jsonb, jsonb, text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.save_stage4_live_bundle(uuid, jsonb, jsonb, jsonb, text)
      TO authenticated, service_role;
  END IF;
END $$;

-- ─── 5) Storage — tenant isolation for project-files ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RETURN;
  END IF;

  -- Drop open authenticated full-bucket policies from 028
  EXECUTE 'DROP POLICY IF EXISTS "project_files_select" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "project_files_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "project_files_update" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "project_files_delete" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "project_files_anon_select" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "project_files_anon_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "project_files_tenant_select" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "project_files_tenant_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "project_files_tenant_update" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "project_files_tenant_delete" ON storage.objects';

  -- Path first segment is typically client_id (or company_id). Authorize via clients.company_id
  -- or exact company_id folder match. Paths alone are NOT sufficient without this check.
  EXECUTE $p$
    CREATE POLICY "project_files_tenant_select"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'project-files'
        AND (
          public.is_platform_admin()
          OR (storage.foldername(name))[1] = public.current_app_company_id()::text
          OR EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id::text = (storage.foldername(name))[1]
              AND c.company_id = public.current_app_company_id()
          )
        )
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY "project_files_tenant_insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'project-files'
        AND (
          public.is_platform_admin()
          OR (storage.foldername(name))[1] = public.current_app_company_id()::text
          OR EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id::text = (storage.foldername(name))[1]
              AND c.company_id = public.current_app_company_id()
          )
        )
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY "project_files_tenant_update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'project-files'
        AND (
          public.is_platform_admin()
          OR (storage.foldername(name))[1] = public.current_app_company_id()::text
          OR EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id::text = (storage.foldername(name))[1]
              AND c.company_id = public.current_app_company_id()
          )
        )
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY "project_files_tenant_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'project-files'
        AND (
          public.is_platform_admin()
          OR (storage.foldername(name))[1] = public.current_app_company_id()::text
          OR EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id::text = (storage.foldername(name))[1]
              AND c.company_id = public.current_app_company_id()
          )
        )
      )
  $p$;
END $$;

-- ─── 6) Child tables without company_id (WhatsApp messages, website pages…) ──
DO $$
BEGIN
  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.whatsapp_messages FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
    DROP POLICY IF EXISTS whatsapp_messages_tenant ON public.whatsapp_messages;
    CREATE POLICY whatsapp_messages_tenant ON public.whatsapp_messages
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.whatsapp_conversations c
          WHERE c.id = whatsapp_messages.conversation_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.whatsapp_conversations c
          WHERE c.id = whatsapp_messages.conversation_id
            AND c.company_id = public.current_app_company_id()
        )
      );
  END IF;

  IF to_regclass('public.social_messages') IS NOT NULL THEN
    ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.social_messages FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_messages TO authenticated;
    DROP POLICY IF EXISTS social_messages_tenant ON public.social_messages;
    CREATE POLICY social_messages_tenant ON public.social_messages
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.social_conversations c
          WHERE c.id = social_messages.conversation_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.social_conversations c
          WHERE c.id = social_messages.conversation_id
            AND c.company_id = public.current_app_company_id()
        )
      );
  END IF;

  IF to_regclass('public.website_pages') IS NOT NULL THEN
    ALTER TABLE public.website_pages ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.website_pages FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_pages TO authenticated;
    DROP POLICY IF EXISTS website_pages_tenant ON public.website_pages;
    CREATE POLICY website_pages_tenant ON public.website_pages
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.website_sites s
          WHERE s.id = website_pages.site_id
            AND s.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.website_sites s
          WHERE s.id = website_pages.site_id
            AND s.company_id = public.current_app_company_id()
        )
      );
  END IF;

  IF to_regclass('public.website_forms') IS NOT NULL THEN
    ALTER TABLE public.website_forms ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.website_forms FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_forms TO authenticated;
    DROP POLICY IF EXISTS website_forms_tenant ON public.website_forms;
    CREATE POLICY website_forms_tenant ON public.website_forms
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.website_sites s
          WHERE s.id = website_forms.site_id
            AND s.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.website_sites s
          WHERE s.id = website_forms.site_id
            AND s.company_id = public.current_app_company_id()
        )
      );
  END IF;

  IF to_regclass('public.website_form_submissions') IS NOT NULL THEN
    ALTER TABLE public.website_form_submissions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.website_form_submissions FROM anon;
    GRANT SELECT, INSERT ON public.website_form_submissions TO authenticated;
    -- Public lead intake uses service role / server API; authenticated read is tenant-scoped
    DROP POLICY IF EXISTS website_form_submissions_tenant ON public.website_form_submissions;
    CREATE POLICY website_form_submissions_tenant ON public.website_form_submissions
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.website_forms f
          JOIN public.website_sites s ON s.id = f.site_id
          WHERE f.id = website_form_submissions.form_id
            AND s.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.website_forms f
          JOIN public.website_sites s ON s.id = f.site_id
          WHERE f.id = website_form_submissions.form_id
            AND s.company_id = public.current_app_company_id()
        )
      );
  END IF;
END $$;

COMMENT ON FUNCTION public.current_app_company_id() IS
  '041: Resolves tenant company for RLS from auth.uid() → users / memberships';
COMMENT ON FUNCTION public.assert_client_tenant_access(uuid) IS
  '041: Blocks cross-tenant live-save RPC writes';
