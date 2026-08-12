-- ============================================================================
-- Tenant-safe RLS for WhatsApp CRM (schema-aware)
-- Parent tables with company_id: stamp + company_id isolation
-- Child tables: isolate via conversation / campaign / clients
-- Prerequisites:
--   public.current_app_company_id()
--   public.is_platform_admin()
--   public.tg_stamp_company_id()  (created by finance script; recreated here if missing)
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
    'whatsapp_accounts',
    'customer_whatsapp_contacts',
    'whatsapp_conversations',
    'crm_opportunities',
    'whatsapp_templates',
    'whatsapp_campaigns',
    'whatsapp_automations'
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

-- ─── 2) Child tables without company_id ──────────────────────────────────────
DO $$
BEGIN
  -- Messages → conversations.company_id
  IF to_regclass('public.whatsapp_messages') IS NOT NULL THEN
    ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.whatsapp_messages FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
    GRANT ALL ON public.whatsapp_messages TO service_role;

    DROP POLICY IF EXISTS "Allow public read whatsapp_messages" ON public.whatsapp_messages;
    DROP POLICY IF EXISTS "Allow public insert whatsapp_messages" ON public.whatsapp_messages;
    DROP POLICY IF EXISTS "Allow public update whatsapp_messages" ON public.whatsapp_messages;
    DROP POLICY IF EXISTS "Allow public delete whatsapp_messages" ON public.whatsapp_messages;
    DROP POLICY IF EXISTS whatsapp_messages_all ON public.whatsapp_messages;
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
    RAISE NOTICE 'whatsapp_messages: via conversations.company_id';
  ELSE
    RAISE NOTICE 'whatsapp_messages: table missing — skipped';
  END IF;

  -- Campaign recipients → campaigns.company_id
  IF to_regclass('public.whatsapp_campaign_recipients') IS NOT NULL THEN
    ALTER TABLE public.whatsapp_campaign_recipients ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.whatsapp_campaign_recipients FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_campaign_recipients TO authenticated;
    GRANT ALL ON public.whatsapp_campaign_recipients TO service_role;

    DROP POLICY IF EXISTS whatsapp_campaign_recipients_all ON public.whatsapp_campaign_recipients;
    DROP POLICY IF EXISTS whatsapp_campaign_recipients_tenant ON public.whatsapp_campaign_recipients;

    CREATE POLICY whatsapp_campaign_recipients_tenant ON public.whatsapp_campaign_recipients
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.whatsapp_campaigns c
          WHERE c.id = whatsapp_campaign_recipients.campaign_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.whatsapp_campaigns c
          WHERE c.id = whatsapp_campaign_recipients.campaign_id
            AND c.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'whatsapp_campaign_recipients: via campaigns.company_id';
  END IF;

  -- Lead extractions → conversations.company_id
  IF to_regclass('public.whatsapp_lead_extractions') IS NOT NULL THEN
    ALTER TABLE public.whatsapp_lead_extractions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.whatsapp_lead_extractions FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_lead_extractions TO authenticated;
    GRANT ALL ON public.whatsapp_lead_extractions TO service_role;

    DROP POLICY IF EXISTS whatsapp_lead_extractions_all ON public.whatsapp_lead_extractions;
    DROP POLICY IF EXISTS whatsapp_lead_extractions_tenant ON public.whatsapp_lead_extractions;

    CREATE POLICY whatsapp_lead_extractions_tenant ON public.whatsapp_lead_extractions
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.whatsapp_conversations c
          WHERE c.id = whatsapp_lead_extractions.conversation_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.whatsapp_conversations c
          WHERE c.id = whatsapp_lead_extractions.conversation_id
            AND c.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'whatsapp_lead_extractions: via conversations.company_id';
  END IF;

  -- Notifications → conversations.company_id (when conversation linked)
  IF to_regclass('public.whatsapp_notifications') IS NOT NULL THEN
    ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.whatsapp_notifications FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_notifications TO authenticated;
    GRANT ALL ON public.whatsapp_notifications TO service_role;

    DROP POLICY IF EXISTS whatsapp_notifications_all ON public.whatsapp_notifications;
    DROP POLICY IF EXISTS whatsapp_notifications_tenant ON public.whatsapp_notifications;

    CREATE POLICY whatsapp_notifications_tenant ON public.whatsapp_notifications
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.whatsapp_conversations c
          WHERE c.id = whatsapp_notifications.conversation_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.whatsapp_conversations c
          WHERE c.id = whatsapp_notifications.conversation_id
            AND c.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'whatsapp_notifications: via conversations.company_id';
  END IF;

  -- Attachments → clients.company_id via customer_id
  IF to_regclass('public.whatsapp_attachments') IS NOT NULL THEN
    ALTER TABLE public.whatsapp_attachments ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.whatsapp_attachments FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_attachments TO authenticated;
    GRANT ALL ON public.whatsapp_attachments TO service_role;

    DROP POLICY IF EXISTS whatsapp_attachments_all ON public.whatsapp_attachments;
    DROP POLICY IF EXISTS whatsapp_attachments_tenant ON public.whatsapp_attachments;
    DROP POLICY IF EXISTS whatsapp_attachments_tenant_isolation ON public.whatsapp_attachments;

    CREATE POLICY whatsapp_attachments_tenant ON public.whatsapp_attachments
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = whatsapp_attachments.customer_id
            AND c.company_id = public.current_app_company_id()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = whatsapp_attachments.customer_id
            AND c.company_id = public.current_app_company_id()
        )
      );
    RAISE NOTICE 'whatsapp_attachments: via clients.company_id';
  END IF;
END $$;

-- Verify
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    tablename LIKE 'whatsapp_%'
    OR tablename IN ('customer_whatsapp_contacts', 'crm_opportunities')
  )
ORDER BY tablename, policyname;
