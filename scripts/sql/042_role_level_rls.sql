-- ============================================================================
-- 042 — Role-level RLS (beyond tenant isolation)
-- Additive. Does not drop data. Replaces open tenant FOR ALL policies on
-- sensitive tables with role-scoped SELECT / write policies.
-- Depends on 041 helpers: current_app_company_id, current_app_user_id, is_platform_admin
-- Safe to re-run.
-- ============================================================================

-- ─── Role helpers ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_app_role_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT u.role_code
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.deleted_at IS NULL
        AND u.is_active = true
      LIMIT 1
    ),
    'staff'
  );
$$;

REVOKE ALL ON FUNCTION public.current_app_role_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_role_code() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_role_in(allowed text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
    OR public.current_app_role_code() = ANY (allowed)
    OR (
      public.current_app_role_code() = 'admin'
      AND 'tenant_admin' = ANY (allowed)
    )
    OR (
      public.current_app_role_code() = 'tenant_admin'
      AND 'admin' = ANY (allowed)
    );
$$;

REVOKE ALL ON FUNCTION public.app_role_in(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_role_in(text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_can_manage_users()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_role_in(ARRAY['super_admin', 'tenant_admin', 'admin']);
$$;

CREATE OR REPLACE FUNCTION public.app_can_read_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_role_in(ARRAY[
    'super_admin', 'tenant_admin', 'admin', 'accountant', 'manager'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.app_can_write_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_role_in(ARRAY[
    'super_admin', 'tenant_admin', 'admin', 'accountant'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.app_can_manage_tenant_settings()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_role_in(ARRAY['super_admin', 'tenant_admin', 'admin']);
$$;

REVOKE ALL ON FUNCTION public.app_can_manage_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_read_finance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_write_finance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_manage_tenant_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_can_manage_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_read_finance() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_write_finance() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_manage_tenant_settings() TO authenticated, service_role;

-- ─── Self-update helpers (SECURITY DEFINER — never query users inside policies) ─
-- Reading public.users from a policy ON public.users causes RLS recursion.
CREATE OR REPLACE FUNCTION public.app_users_self_update_ok(
  p_role_code text,
  p_company_id uuid,
  p_is_platform_admin boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.deleted_at IS NULL
      AND u.is_active = true
      AND u.role_code IS NOT DISTINCT FROM p_role_code
      AND u.company_id IS NOT DISTINCT FROM p_company_id
      AND COALESCE(u.is_platform_admin, false)
            IS NOT DISTINCT FROM COALESCE(p_is_platform_admin, false)
  );
$$;

CREATE OR REPLACE FUNCTION public.app_can_update_user_row(
  p_target_id uuid,
  p_new_role_code text,
  p_new_company_id uuid,
  p_new_is_platform_admin boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN public.is_platform_admin() THEN true
      WHEN public.app_can_manage_users()
           AND p_new_company_id IS NOT DISTINCT FROM public.current_app_company_id()
           AND EXISTS (
             SELECT 1 FROM public.users t
             WHERE t.id = p_target_id
               AND t.company_id = public.current_app_company_id()
           )
        THEN true
      WHEN p_target_id IS NOT DISTINCT FROM public.current_app_user_id()
           AND public.app_users_self_update_ok(
             p_new_role_code,
             p_new_company_id,
             p_new_is_platform_admin
           )
        THEN true
      ELSE false
    END;
$$;

REVOKE ALL ON FUNCTION public.app_users_self_update_ok(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_can_update_user_row(uuid, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_users_self_update_ok(text, uuid, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_update_user_row(uuid, text, uuid, boolean)
  TO authenticated, service_role;

-- ─── users: staff cannot escalate / manage peers ─────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN RETURN; END IF;

  DROP POLICY IF EXISTS users_select_tenant ON public.users;
  DROP POLICY IF EXISTS users_insert_tenant ON public.users;
  DROP POLICY IF EXISTS users_update_tenant ON public.users;
  DROP POLICY IF EXISTS users_delete_tenant ON public.users;
  DROP POLICY IF EXISTS users_tenant_isolation ON public.users;
  DROP POLICY IF EXISTS users_select_scoped ON public.users;
  DROP POLICY IF EXISTS users_insert_admin ON public.users;
  DROP POLICY IF EXISTS users_update_admin ON public.users;
  DROP POLICY IF EXISTS users_delete_admin ON public.users;

  CREATE POLICY users_select_scoped ON public.users
    FOR SELECT TO authenticated
    USING (
      public.is_platform_admin()
      OR id = public.current_app_user_id()
      OR (
        company_id = public.current_app_company_id()
        AND public.app_can_manage_users()
      )
      OR (
        -- Non-admin peers: read-only directory within tenant
        company_id = public.current_app_company_id()
        AND public.app_role_in(ARRAY[
          'tenant_admin','admin','manager','engineer','sales','accountant','employee','staff','viewer'
        ])
      )
    );

  CREATE POLICY users_insert_admin ON public.users
    FOR INSERT TO authenticated
    WITH CHECK (
      public.is_platform_admin()
      OR (
        company_id = public.current_app_company_id()
        AND public.app_can_manage_users()
      )
    );

  -- No SELECT FROM public.users inside this policy — privileged-field checks go
  -- through SECURITY DEFINER helpers only (avoids RLS recursion).
  CREATE POLICY users_update_admin ON public.users
    FOR UPDATE TO authenticated
    USING (
      public.is_platform_admin()
      OR (
        company_id = public.current_app_company_id()
        AND public.app_can_manage_users()
      )
      OR id = public.current_app_user_id()
    )
    WITH CHECK (
      public.app_can_update_user_row(
        id,
        role_code,
        company_id,
        COALESCE(is_platform_admin, false)
      )
    );

  CREATE POLICY users_delete_admin ON public.users
    FOR DELETE TO authenticated
    USING (
      public.is_platform_admin()
      OR (
        company_id = public.current_app_company_id()
        AND public.app_can_manage_users()
      )
    );
END $$;

-- ─── Finance tables: staff/sales/engineer cannot write ───────────────────────
-- This block is intentionally schema-aware. Finance tables do not all share the
-- same tenant key, and a policy must never reference a column that is absent.
DO $$
DECLARE
  t text;
  has_company_id boolean;
  has_client_id boolean;
  finance text[] := ARRAY[
    'chart_of_accounts','cost_centers','journal_entries','vouchers','payments',
    'zatca_invoices','zatca_retry_queue',
    'acc_fiscal_years','acc_fiscal_periods','acc_accounting_rules',
    'acc_ar_invoices','acc_ap_bills','acc_bank_accounts','acc_bank_transactions',
    'acc_fixed_assets','acc_budgets','acc_project_ledgers','acc_audit_findings'
  ];
BEGIN
  FOREACH t IN ARRAY finance LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_finance_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_finance_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_finance_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_finance_delete', t);

    -- The retry queue has no UI/RPC consumer in the repository and is operational
    -- infrastructure owned through zatca_invoice_id. Keep it service-role-only;
    -- do not add a tenant key merely to satisfy this policy loop.
    IF t = 'zatca_retry_queue' THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
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

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    IF has_company_id THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
           USING (
             (public.is_platform_admin() OR company_id = public.current_app_company_id())
             AND public.app_can_read_finance()
           )',
        t || '_finance_select', t
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
           WITH CHECK (
             (public.is_platform_admin() OR company_id = public.current_app_company_id())
             AND public.app_can_write_finance()
           )',
        t || '_finance_insert', t
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
           USING (
             (public.is_platform_admin() OR company_id = public.current_app_company_id())
             AND public.app_can_write_finance()
           )
           WITH CHECK (
             (public.is_platform_admin() OR company_id = public.current_app_company_id())
             AND public.app_can_write_finance()
           )',
        t || '_finance_update', t
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
           USING (
             (public.is_platform_admin() OR company_id = public.current_app_company_id())
             AND public.app_can_write_finance()
           )',
        t || '_finance_delete', t
      );
    ELSIF has_client_id THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
           USING (
             (public.is_platform_admin() OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             ))
             AND public.app_can_read_finance()
           )',
        t || '_finance_select', t, t
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
           WITH CHECK (
             (public.is_platform_admin() OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             ))
             AND public.app_can_write_finance()
           )',
        t || '_finance_insert', t, t
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
           USING (
             (public.is_platform_admin() OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             ))
             AND public.app_can_write_finance()
           )
           WITH CHECK (
             (public.is_platform_admin() OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             ))
             AND public.app_can_write_finance()
           )',
        t || '_finance_update', t, t, t
      );

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
           USING (
             (public.is_platform_admin() OR EXISTS (
               SELECT 1 FROM public.clients c
               WHERE c.id::text = %I.client_id::text
                 AND c.company_id = public.current_app_company_id()
             ))
             AND public.app_can_write_finance()
           )',
        t || '_finance_delete', t, t
      );
    ELSE
      -- No tenant key and no safe relation: authenticated access is not granted.
      -- service_role remains the only direct access path.
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

-- journal_entry_lines: inherit finance write via parent journal
DO $$
BEGIN
  IF to_regclass('public.journal_entry_lines') IS NULL THEN RETURN; END IF;

  ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.journal_entry_lines FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entry_lines TO authenticated;
  GRANT ALL ON public.journal_entry_lines TO service_role;

  DROP POLICY IF EXISTS journal_entry_lines_tenant_all ON public.journal_entry_lines;
  DROP POLICY IF EXISTS journal_entry_lines_finance_all ON public.journal_entry_lines;

  CREATE POLICY journal_entry_lines_finance_all ON public.journal_entry_lines
    FOR ALL TO authenticated
    USING (
      public.app_can_read_finance()
      AND EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.id = journal_entry_id
          AND (public.is_platform_admin() OR je.company_id = public.current_app_company_id())
      )
    )
    WITH CHECK (
      public.app_can_write_finance()
      AND EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.id = journal_entry_id
          AND (public.is_platform_admin() OR je.company_id = public.current_app_company_id())
      )
    );
END $$;

-- ─── SaaS control plane: mutate only tenant admins / platform ────────────────
DO $$
BEGIN
  IF to_regclass('public.tenant_modules') IS NOT NULL THEN
    DROP POLICY IF EXISTS tenant_modules_tenant ON public.tenant_modules;
    DROP POLICY IF EXISTS tenant_modules_tenant_isolation ON public.tenant_modules;
    DROP POLICY IF EXISTS tenant_modules_select ON public.tenant_modules;
    DROP POLICY IF EXISTS tenant_modules_write ON public.tenant_modules;

    CREATE POLICY tenant_modules_select ON public.tenant_modules
      FOR SELECT TO authenticated
      USING (
        public.is_platform_admin()
        OR company_id = public.current_app_company_id()
      );

    CREATE POLICY tenant_modules_write ON public.tenant_modules
      FOR ALL TO authenticated
      USING (
        public.is_platform_admin()
        OR (
          company_id = public.current_app_company_id()
          AND public.app_can_manage_tenant_settings()
        )
      )
      WITH CHECK (
        public.is_platform_admin()
        OR (
          company_id = public.current_app_company_id()
          AND public.app_can_manage_tenant_settings()
        )
      );
  END IF;

  IF to_regclass('public.tenant_subscriptions') IS NOT NULL THEN
    DROP POLICY IF EXISTS tenant_subscriptions_tenant ON public.tenant_subscriptions;
    DROP POLICY IF EXISTS tenant_subscriptions_tenant_isolation ON public.tenant_subscriptions;
    DROP POLICY IF EXISTS tenant_subscriptions_select ON public.tenant_subscriptions;
    DROP POLICY IF EXISTS tenant_subscriptions_write ON public.tenant_subscriptions;

    CREATE POLICY tenant_subscriptions_select ON public.tenant_subscriptions
      FOR SELECT TO authenticated
      USING (
        public.is_platform_admin()
        OR (
          company_id = public.current_app_company_id()
          AND public.app_can_manage_tenant_settings()
        )
      );

    CREATE POLICY tenant_subscriptions_write ON public.tenant_subscriptions
      FOR ALL TO authenticated
      USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin());
  END IF;

  IF to_regclass('public.saas_audit_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS saas_audit_tenant ON public.saas_audit_logs;
    DROP POLICY IF EXISTS saas_audit_logs_tenant_isolation ON public.saas_audit_logs;
    DROP POLICY IF EXISTS saas_audit_logs_select ON public.saas_audit_logs;
    DROP POLICY IF EXISTS saas_audit_logs_insert ON public.saas_audit_logs;

    CREATE POLICY saas_audit_logs_select ON public.saas_audit_logs
      FOR SELECT TO authenticated
      USING (
        public.is_platform_admin()
        OR (
          company_id = public.current_app_company_id()
          AND public.app_can_manage_tenant_settings()
        )
      );

    -- Inserts come from trusted server paths; authenticated tenant admins may append
    CREATE POLICY saas_audit_logs_insert ON public.saas_audit_logs
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_platform_admin()
        OR (
          company_id = public.current_app_company_id()
          AND public.app_can_manage_tenant_settings()
        )
      );
  END IF;
END $$;

COMMENT ON FUNCTION public.app_can_write_finance() IS
  '042: accountant/admin only — blocks staff JWT from mutating finance tables';
COMMENT ON FUNCTION public.app_can_manage_users() IS
  '042: tenant admin only — blocks privilege escalation via users UPDATE';
COMMENT ON FUNCTION public.app_users_self_update_ok(text, uuid, boolean) IS
  '042/043: SECURITY DEFINER — self-update cannot change role/company/platform flag';
COMMENT ON FUNCTION public.app_can_update_user_row(uuid, text, uuid, boolean) IS
  '042/043: SECURITY DEFINER gate for users UPDATE (avoids RLS recursion)';
