-- ============================================================================
-- Tenant-safe Storage RLS for bucket project-files
-- Drops open authenticated + anon full-bucket policies from 028.
-- Path first segment must be company_id OR a clients.id in your company.
-- Prerequisites:
--   public.current_app_company_id()
--   public.is_platform_admin()
-- Idempotent.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'storage schema missing — skipped';
    RETURN;
  END IF;

  -- Keep bucket private
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'project-files') THEN
    UPDATE storage.buckets
    SET public = false
    WHERE id = 'project-files' AND public IS DISTINCT FROM false;
  END IF;

  -- Drop open policies (028 + prior tenant attempts)
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
          SELECT 1 FROM public.clients c
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
          SELECT 1 FROM public.clients c
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
          SELECT 1 FROM public.clients c
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
          SELECT 1 FROM public.clients c
          WHERE c.id::text = (storage.foldername(name))[1]
            AND c.company_id = public.current_app_company_id()
        )
      )
    );

  RAISE NOTICE 'storage.project-files: tenant policies applied; anon open policies dropped';
END $$;

-- Verify (project-files policies only)
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'project_files%'
ORDER BY policyname;
