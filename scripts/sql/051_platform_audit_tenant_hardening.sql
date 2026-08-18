-- ============================================================================
-- Platform audit hardening: clients + project-files tenant isolation
--
-- Scope:
--   1) Remove legacy permissive clients policies that can bypass the canonical
--      current_app_company_id() function.
--   2) Recreate private project-files Storage policies using the object path
--      itself, supporting both existing <company_id>/... files and current
--      <client_id>/quotation/... client attachment files.
--
-- Preconditions:
--   public.current_app_company_id() must map auth.uid() to an active,
--   non-deleted public.users row and its company_id.
--   public.is_platform_admin() must preserve the established administrator path.
--
-- Properties:
--   Atomic, idempotent, no data deletion, no object moves, and no public bucket.
--
-- Rollback plan:
--   Reapply the previous policy definitions from the immediately preceding
--   migration snapshot only after confirming their original semantics. Data and
--   stored objects remain untouched by this migration.
-- ============================================================================

BEGIN;

-- ─── public.clients ─────────────────────────────────────────────────────────
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.clients FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

-- Legacy policies used current_user_company_id(), which did not consistently
-- include the soft-delete invariant. Remove them before installing one canonical
-- policy based on current_app_company_id().
DROP POLICY IF EXISTS "Allow public read clients" ON public.clients;
DROP POLICY IF EXISTS "Allow public insert clients" ON public.clients;
DROP POLICY IF EXISTS "Allow public update clients" ON public.clients;
DROP POLICY IF EXISTS "Allow public delete clients" ON public.clients;
DROP POLICY IF EXISTS clients_all ON public.clients;
DROP POLICY IF EXISTS clients_tenant_all ON public.clients;
DROP POLICY IF EXISTS clients_tenant_isolation ON public.clients;
DROP POLICY IF EXISTS clients_select_own_company ON public.clients;
DROP POLICY IF EXISTS clients_insert_own_company ON public.clients;
DROP POLICY IF EXISTS clients_update_own_company ON public.clients;
DROP POLICY IF EXISTS clients_delete_own_company ON public.clients;

CREATE POLICY clients_tenant_isolation ON public.clients
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  )
  WITH CHECK (
    public.is_platform_admin()
    OR company_id = public.current_app_company_id()
  );

-- ─── storage.objects / project-files ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'storage schema missing — project-files policy section skipped';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'project-files') THEN
    UPDATE storage.buckets
    SET public = false
    WHERE id = 'project-files' AND public IS DISTINCT FROM false;
  END IF;

  DROP POLICY IF EXISTS "project_files_select" ON storage.objects;
  DROP POLICY IF EXISTS "project_files_insert" ON storage.objects;
  DROP POLICY IF EXISTS "project_files_update" ON storage.objects;
  DROP POLICY IF EXISTS "project_files_delete" ON storage.objects;
  DROP POLICY IF EXISTS "project_files_anon_select" ON storage.objects;
  DROP POLICY IF EXISTS "project_files_anon_insert" ON storage.objects;
  DROP POLICY IF EXISTS "project_files_tenant_select" ON storage.objects;
  DROP POLICY IF EXISTS "project_files_tenant_insert" ON storage.objects;
  DROP POLICY IF EXISTS "project_files_tenant_update" ON storage.objects;
  DROP POLICY IF EXISTS "project_files_tenant_delete" ON storage.objects;

  -- `name` is storage.objects.name. The first path segment may be either the
  -- tenant company UUID (legacy files) or a client UUID belonging to the tenant
  -- (current quotation attachments). Never use public.clients.name here.
  CREATE POLICY "project_files_tenant_select"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'project-files'
      AND (
        public.is_platform_admin()
        OR (storage.foldername(name))[1] = public.current_app_company_id()::text
        OR EXISTS (
          SELECT 1
          FROM public.clients c
          WHERE c.id::text = (storage.foldername(name))[1]
            AND c.company_id = public.current_app_company_id()
        )
      )
    );

  CREATE POLICY "project_files_tenant_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'project-files'
      AND (
        public.is_platform_admin()
        OR (storage.foldername(name))[1] = public.current_app_company_id()::text
        OR EXISTS (
          SELECT 1
          FROM public.clients c
          WHERE c.id::text = (storage.foldername(name))[1]
            AND c.company_id = public.current_app_company_id()
        )
      )
    );

  CREATE POLICY "project_files_tenant_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'project-files'
      AND (
        public.is_platform_admin()
        OR (storage.foldername(name))[1] = public.current_app_company_id()::text
        OR EXISTS (
          SELECT 1
          FROM public.clients c
          WHERE c.id::text = (storage.foldername(name))[1]
            AND c.company_id = public.current_app_company_id()
        )
      )
    )
    WITH CHECK (
      bucket_id = 'project-files'
      AND (
        public.is_platform_admin()
        OR (storage.foldername(name))[1] = public.current_app_company_id()::text
        OR EXISTS (
          SELECT 1
          FROM public.clients c
          WHERE c.id::text = (storage.foldername(name))[1]
            AND c.company_id = public.current_app_company_id()
        )
      )
    );

  CREATE POLICY "project_files_tenant_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'project-files'
      AND (
        public.is_platform_admin()
        OR (storage.foldername(name))[1] = public.current_app_company_id()::text
        OR EXISTS (
          SELECT 1
          FROM public.clients c
          WHERE c.id::text = (storage.foldername(name))[1]
            AND c.company_id = public.current_app_company_id()
        )
      )
    );
END $$;

COMMIT;

-- Post-apply verification (read-only):
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE (schemaname = 'public' AND tablename = 'clients')
--    OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'project_files%')
-- ORDER BY schemaname, tablename, policyname;
