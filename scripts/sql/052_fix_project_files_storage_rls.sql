-- ============================================================================
-- Hotfix: correct project-files Storage RLS outer-path reference
--
-- Migration 051 correctly restricted project-files to authenticated users, but
-- the unqualified `name` inside the clients EXISTS scope resolved to c.name.
-- This migration replaces only the four project-files tenant policies and uses
-- storage.objects.name explicitly for the outer Storage object path.
--
-- Supported paths:
--   1) <company_id>/...                 (legacy company prefix)
--   2) <client_id>/quotation/...        (current client attachment prefix)
--
-- Safety properties:
--   - Atomic and idempotent.
--   - No clients/users/accounting/business-data changes.
--   - No Storage object deletion, update, move, rename, or bucket visibility
--     change.
-- ============================================================================

BEGIN;

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
      OR (storage.foldername(storage.objects.name))[1] = public.current_app_company_id()::text
      OR EXISTS (
        SELECT 1
        FROM public.clients AS c
        WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
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
      OR (storage.foldername(storage.objects.name))[1] = public.current_app_company_id()::text
      OR EXISTS (
        SELECT 1
        FROM public.clients AS c
        WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
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
      OR (storage.foldername(storage.objects.name))[1] = public.current_app_company_id()::text
      OR EXISTS (
        SELECT 1
        FROM public.clients AS c
        WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
          AND c.company_id = public.current_app_company_id()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'project-files'
    AND (
      public.is_platform_admin()
      OR (storage.foldername(storage.objects.name))[1] = public.current_app_company_id()::text
      OR EXISTS (
        SELECT 1
        FROM public.clients AS c
        WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
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
      OR (storage.foldername(storage.objects.name))[1] = public.current_app_company_id()::text
      OR EXISTS (
        SELECT 1
        FROM public.clients AS c
        WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
          AND c.company_id = public.current_app_company_id()
      )
    )
  );

COMMIT;
