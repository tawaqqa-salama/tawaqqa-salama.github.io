-- PR-A1: Production security remediation before technical-report lifecycle
-- Scope: close the policyless RLS gap for correspondence attachments and
-- harden clearly unnecessary grants. No technical-report lifecycle, PDF,
-- workflow, classification, backfill, or Storage object mutation.
--
-- The attachment broker/RPCs remain the only authenticated application entry
-- points. Authenticated table DML is intentionally not granted.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project_correspondence_attachments') IS NULL
    OR to_regclass('public.project_correspondences') IS NULL
    OR to_regclass('public.projects') IS NULL
    OR to_regclass('public.clients') IS NULL
    OR to_regclass('public.primary_engineering_project_mappings') IS NULL THEN
    RAISE EXCEPTION 'PR-A1 requires the correspondence, project, client, mapping, and attachment contracts';
  END IF;
END
$$;

ALTER TABLE public.project_correspondence_attachments ENABLE ROW LEVEL SECURITY;

-- Keep the exact ownership chain declarative at the row policy boundary:
-- attachment -> correspondence -> project/client -> company.
-- No authenticated table grants are added; these policies provide a defense-in-
-- depth boundary for any future explicitly approved table grant.
DROP POLICY IF EXISTS project_correspondence_attachments_tenant_select
  ON public.project_correspondence_attachments;
CREATE POLICY project_correspondence_attachments_tenant_select
  ON public.project_correspondence_attachments
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_correspondences AS pc
      JOIN public.projects AS p
        ON p.id = pc.project_id
       AND p.client_id = pc.client_id
      JOIN public.clients AS c
        ON c.id = pc.client_id
      JOIN public.primary_engineering_project_mappings AS m
        ON m.client_id = pc.client_id
       AND m.project_id = pc.project_id
      WHERE pc.id = project_correspondence_attachments.correspondence_id
        AND pc.project_id = project_correspondence_attachments.project_id
        AND pc.client_id = project_correspondence_attachments.client_id
        AND c.company_id = public.current_app_company_id()
    )
  );

DROP POLICY IF EXISTS project_correspondence_attachments_tenant_insert
  ON public.project_correspondence_attachments;
CREATE POLICY project_correspondence_attachments_tenant_insert
  ON public.project_correspondence_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_correspondences AS pc
      JOIN public.projects AS p
        ON p.id = pc.project_id
       AND p.client_id = pc.client_id
      JOIN public.clients AS c
        ON c.id = pc.client_id
      JOIN public.primary_engineering_project_mappings AS m
        ON m.client_id = pc.client_id
       AND m.project_id = pc.project_id
      WHERE pc.id = project_correspondence_attachments.correspondence_id
        AND pc.project_id = project_correspondence_attachments.project_id
        AND pc.client_id = project_correspondence_attachments.client_id
        AND c.company_id = public.current_app_company_id()
    )
  );

DROP POLICY IF EXISTS project_correspondence_attachments_tenant_update
  ON public.project_correspondence_attachments;
CREATE POLICY project_correspondence_attachments_tenant_update
  ON public.project_correspondence_attachments
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_correspondences AS pc
      JOIN public.projects AS p
        ON p.id = pc.project_id
       AND p.client_id = pc.client_id
      JOIN public.clients AS c
        ON c.id = pc.client_id
      JOIN public.primary_engineering_project_mappings AS m
        ON m.client_id = pc.client_id
       AND m.project_id = pc.project_id
      WHERE pc.id = project_correspondence_attachments.correspondence_id
        AND pc.project_id = project_correspondence_attachments.project_id
        AND pc.client_id = project_correspondence_attachments.client_id
        AND c.company_id = public.current_app_company_id()
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_correspondences AS pc
      JOIN public.projects AS p
        ON p.id = pc.project_id
       AND p.client_id = pc.client_id
      JOIN public.clients AS c
        ON c.id = pc.client_id
      JOIN public.primary_engineering_project_mappings AS m
        ON m.client_id = pc.client_id
       AND m.project_id = pc.project_id
      WHERE pc.id = project_correspondence_attachments.correspondence_id
        AND pc.project_id = project_correspondence_attachments.project_id
        AND pc.client_id = project_correspondence_attachments.client_id
        AND c.company_id = public.current_app_company_id()
    )
  );

DROP POLICY IF EXISTS project_correspondence_attachments_tenant_delete
  ON public.project_correspondence_attachments;
CREATE POLICY project_correspondence_attachments_tenant_delete
  ON public.project_correspondence_attachments
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.project_correspondences AS pc
      JOIN public.projects AS p
        ON p.id = pc.project_id
       AND p.client_id = pc.client_id
      JOIN public.clients AS c
        ON c.id = pc.client_id
      JOIN public.primary_engineering_project_mappings AS m
        ON m.client_id = pc.client_id
       AND m.project_id = pc.project_id
      WHERE pc.id = project_correspondence_attachments.correspondence_id
        AND pc.project_id = project_correspondence_attachments.project_id
        AND pc.client_id = project_correspondence_attachments.client_id
        AND c.company_id = public.current_app_company_id()
    )
  );

REVOKE ALL ON public.project_correspondence_attachments FROM PUBLIC;
REVOKE ALL ON public.project_correspondence_attachments FROM anon;
REVOKE ALL ON public.project_correspondence_attachments FROM authenticated;
GRANT ALL ON public.project_correspondence_attachments TO service_role;

-- Storage object policy is the application boundary. Remove only the clearly
-- unintended anon table grants; preserve authenticated CRUD because Supabase
-- Storage's RLS-backed API uses these object-table privileges.
REVOKE ALL ON storage.objects FROM anon;
REVOKE ALL ON storage.buckets FROM anon;

-- Remove elevated table privileges from the authenticated application role.
-- CRUD remains unchanged on the core tenant tables.
REVOKE REFERENCES, TRIGGER, TRUNCATE ON public.clients FROM authenticated;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON public.project_engineering_live FROM authenticated;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON public.project_supervision_reports FROM authenticated;
REVOKE REFERENCES, TRIGGER, TRUNCATE ON public.report_pdf_snapshots FROM authenticated;

-- The old B4A finalize overload is no longer an authenticated application
-- entry point: B4B's trusted broker calls the service-role-only overload.
REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid)
  FROM service_role;

COMMENT ON TABLE public.project_correspondence_attachments IS
  'PR-A1: tenant-scoped defense-in-depth policies; authenticated direct table DML remains revoked; application access uses the approved RPC/broker contracts.';

COMMIT;
