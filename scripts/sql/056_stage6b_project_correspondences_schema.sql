-- ============================================================================
-- Stage 6B-1: Canonical correspondence schema contract + tenant RLS
--
-- Scope deliberately limited to the relational foundation only:
--   * public.project_correspondences
--   * project/client integrity
--   * read-safe tenant RLS via client_id -> clients.company_id
--
-- Explicitly excluded:
--   * Stage 6A / Migration 055 changes
--   * Stage 7 gate changes
--   * RPCs, UI, PDF, Storage, attachments, recipients, replies, revisions,
--     audit events, legacy adoption, or data backfill
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-1 requires public.projects';
  END IF;

  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'Stage 6B-1 requires public.clients';
  END IF;

  IF to_regclass('public.project_correspondences') IS NOT NULL THEN
    RAISE EXCEPTION 'public.project_correspondences already exists; refusing an implicit schema replacement';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'client_id'
  ) THEN
    RAISE EXCEPTION 'Stage 6B-1 requires public.projects(id, client_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'Stage 6B-1 requires public.clients(id, company_id)';
  END IF;

  -- A composite unique key lets the correspondence row prove that its project
  -- and client belong together without using a trigger or trusting frontend IDs.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_id_client_id_key'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_id_client_id_key UNIQUE (id, client_id);
  END IF;
END $$;

CREATE TABLE public.project_correspondences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  client_id uuid NOT NULL,

  correspondence_type text NOT NULL,
  direction text NOT NULL DEFAULT 'outgoing',

  subject text NOT NULL,
  reference_number text,
  correspondence_date date,
  body text,

  document_status text NOT NULL DEFAULT 'draft',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT project_correspondences_type_check
    CHECK (correspondence_type IN ('engineering_delivery', 'cd_cover_letter')),
  CONSTRAINT project_correspondences_direction_check
    CHECK (direction IN ('outgoing', 'incoming')),
  CONSTRAINT project_correspondences_document_status_check
    CHECK (document_status IN ('draft', 'preparing', 'ready', 'approved')),

  CONSTRAINT project_correspondences_client_fk
    FOREIGN KEY (client_id)
    REFERENCES public.clients(id)
    ON DELETE RESTRICT,
  CONSTRAINT project_correspondences_project_client_fk
    FOREIGN KEY (project_id, client_id)
    REFERENCES public.projects(id, client_id)
    ON DELETE RESTRICT
);

-- Expected access patterns for the future per-project and per-client workspace.
CREATE INDEX idx_project_correspondences_project_date
  ON public.project_correspondences (project_id, correspondence_date DESC, created_at DESC);

CREATE INDEX idx_project_correspondences_client_status_date
  ON public.project_correspondences (client_id, document_status, correspondence_date DESC, created_at DESC);

CREATE INDEX idx_project_correspondences_client_reference
  ON public.project_correspondences (client_id, reference_number)
  WHERE reference_number IS NOT NULL;

ALTER TABLE public.project_correspondences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.project_correspondences FROM anon;

-- Stage 6B-1 is intentionally read-only for normal application users.
-- Stage 6B-2 will introduce server-controlled write RPCs with semantic
-- validation, optimistic locking, approval controls, and tenant checks.
REVOKE ALL ON public.project_correspondences FROM authenticated;
GRANT SELECT ON public.project_correspondences TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_correspondences FROM authenticated;

GRANT ALL ON public.project_correspondences TO service_role;

CREATE POLICY project_correspondences_tenant_select
  ON public.project_correspondences
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = project_correspondences.client_id
        AND c.company_id = public.current_app_company_id()
    )
  );

COMMENT ON TABLE public.project_correspondences IS
  'Stage 6B canonical correspondence contract. Tenant ownership is derived only through client_id -> clients.company_id.';

COMMENT ON COLUMN public.project_correspondences.direction IS
  'Schema-ready for future expansion; Stage 6B-1 implements no incoming workflow behavior.';

COMMENT ON COLUMN public.project_correspondences.document_status IS
  'Content lifecycle only: draft, preparing, ready, approved. It is not a dispatch, receipt, archive, or revision lifecycle.';

COMMIT;

-- Read-only verification aid for the migration reviewer:
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'project_correspondences'
-- ORDER BY grantee, privilege_type;
--
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'project_correspondences';
