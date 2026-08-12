-- ============================================================================
-- Tenant-safe RLS for Social + Website CRM (schema-aware)
-- Parents with company_id: stamp + isolation
-- Children: via conversation / post / site / form / clients
-- Prerequisites:
--   public.current_app_company_id()
--   public.is_platform_admin()
--   public.tg_stamp_company_id()
-- Idempotent. Skips missing tables.
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

REVOKE ALL ON FUNCTION public.tg_stamp_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_stamp_company_id() TO authenticated, service_role;

-- ─── 1) Parent tables with company_id ────────────────────────────────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'marketing_campaigns',
    'social_accounts',
    'client_social_identities',
    'social_conversations',
    'social_posts',
    'website_sites'
  ];
  has_company_id boolean;
  r record;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '%: table missing — skipped', t;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) INTO has_company_id;

    IF NOT has_company_id THEN
      RAISE NOTICE '%: no company_id — skipped in parent pass', t;
      CONTINUE;
    END IF;

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
          policyname LIKE 'Allow public %'
          OR policyname = t || '_all'
          OR policyname = t || '_tenant_isolation'
          OR policyname LIKE '%_open%'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

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
    RAISE NOTICE '%: applied company_id tenant isolation (+ stamp)', t;
  END LOOP;
END $$;

-- ─── 2) Child tables ─────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  site_children text[] := ARRAY[
    'website_pages',
    'website_services',
    'website_project_showcases',
    'website_blog_categories',
    'website_blog_posts',
    'website_forms',
    'website_media'
  ];
  r record;
BEGIN
  -- social_messages → conversations
  IF to_regclass('public.social_messages') IS NOT NULL THEN
    ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.social_messages FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_messages TO authenticated;
    GRANT ALL ON public.social_messages TO service_role;
    DROP POLICY IF EXISTS social_messages_all ON public.social_messages;
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
    RAISE NOTICE 'social_messages: via conversations.company_id';
  END IF;

  -- social_post_targets → posts
  IF to_regclass('public.social_post_targets') IS NOT NULL THEN
    ALTER TABLE public.social_post_targets ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.social_post_targets FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_targets TO authenticated;
    GRANT ALL ON public.social_post_targets TO service_role;
    DROP POLICY IF EXISTS social_post_targets_all ON public.social_post_targets;
    DROP POLICY IF EXISTS social_post_targets_tenant ON public.social_post_targets;
    CREATE POLICY social_post_targets_tenant ON public.social_post_targets
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.social_posts p
          WHERE p.id = social_post_targets.post_id
            AND p.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.social_posts p
          WHERE p.id = social_post_targets.post_id
            AND p.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'social_post_targets: via posts.company_id';
  END IF;

  -- social_analytics_snapshots → accounts
  IF to_regclass('public.social_analytics_snapshots') IS NOT NULL THEN
    ALTER TABLE public.social_analytics_snapshots ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.social_analytics_snapshots FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_analytics_snapshots TO authenticated;
    GRANT ALL ON public.social_analytics_snapshots TO service_role;
    DROP POLICY IF EXISTS social_analytics_snapshots_all ON public.social_analytics_snapshots;
    DROP POLICY IF EXISTS social_analytics_snapshots_tenant ON public.social_analytics_snapshots;
    CREATE POLICY social_analytics_snapshots_tenant ON public.social_analytics_snapshots
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.social_accounts a
          WHERE a.id = social_analytics_snapshots.social_account_id
            AND a.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.social_accounts a
          WHERE a.id = social_analytics_snapshots.social_account_id
            AND a.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'social_analytics_snapshots: via accounts.company_id';
  END IF;

  -- website_* with site_id
  FOREACH t IN ARRAY site_children LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '%: table missing — skipped', t;
      CONTINUE;
    END IF;

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
          policyname LIKE 'Allow public %'
          OR policyname = t || '_all'
          OR policyname = t || '_tenant'
          OR policyname LIKE '%_open%'
        )
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR ALL TO authenticated
         USING (
           public.is_platform_admin()
           OR EXISTS (
             SELECT 1 FROM public.website_sites s
             WHERE s.id = %I.site_id
               AND s.company_id = public.current_app_company_id()
           )
         )
         WITH CHECK (
           public.is_platform_admin()
           OR EXISTS (
             SELECT 1 FROM public.website_sites s
             WHERE s.id = %I.site_id
               AND s.company_id = public.current_app_company_id()
           )
         )',
      t || '_tenant', t, t, t
    );
    RAISE NOTICE '%: via website_sites.company_id', t;
  END LOOP;

  -- form submissions → forms → sites
  IF to_regclass('public.website_form_submissions') IS NOT NULL THEN
    ALTER TABLE public.website_form_submissions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.website_form_submissions FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_form_submissions TO authenticated;
    GRANT ALL ON public.website_form_submissions TO service_role;
    DROP POLICY IF EXISTS website_form_submissions_all ON public.website_form_submissions;
    DROP POLICY IF EXISTS website_form_submissions_tenant ON public.website_form_submissions;
    CREATE POLICY website_form_submissions_tenant ON public.website_form_submissions
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1
          FROM public.website_forms f
          JOIN public.website_sites s ON s.id = f.site_id
          WHERE f.id = website_form_submissions.form_id
            AND s.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1
          FROM public.website_forms f
          JOIN public.website_sites s ON s.id = f.site_id
          WHERE f.id = website_form_submissions.form_id
            AND s.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'website_form_submissions: via forms→sites.company_id';
  END IF;

  -- timeline → clients
  IF to_regclass('public.customer_timeline_events') IS NOT NULL THEN
    ALTER TABLE public.customer_timeline_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.customer_timeline_events FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_timeline_events TO authenticated;
    GRANT ALL ON public.customer_timeline_events TO service_role;
    DROP POLICY IF EXISTS customer_timeline_events_all ON public.customer_timeline_events;
    DROP POLICY IF EXISTS customer_timeline_events_tenant ON public.customer_timeline_events;
    CREATE POLICY customer_timeline_events_tenant ON public.customer_timeline_events
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = customer_timeline_events.customer_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = customer_timeline_events.customer_id
            AND c.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'customer_timeline_events: via clients.company_id';
  END IF;

  -- marketing_audit_logs: no tenant key → platform admin only
  IF to_regclass('public.marketing_audit_logs') IS NOT NULL THEN
    ALTER TABLE public.marketing_audit_logs ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.marketing_audit_logs FROM anon;
    GRANT SELECT, INSERT ON public.marketing_audit_logs TO authenticated;
    GRANT ALL ON public.marketing_audit_logs TO service_role;
    DROP POLICY IF EXISTS marketing_audit_logs_all ON public.marketing_audit_logs;
    DROP POLICY IF EXISTS marketing_audit_logs_tenant ON public.marketing_audit_logs;
    CREATE POLICY marketing_audit_logs_tenant ON public.marketing_audit_logs
      FOR ALL TO authenticated
      USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin());
    RAISE NOTICE 'marketing_audit_logs: platform admin only (no tenant key)';
  END IF;
END $$;

-- Verify
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    tablename LIKE 'social_%'
    OR tablename LIKE 'website_%'
    OR tablename IN (
      'marketing_campaigns',
      'client_social_identities',
      'customer_timeline_events',
      'marketing_audit_logs'
    )
  )
ORDER BY tablename, policyname;
