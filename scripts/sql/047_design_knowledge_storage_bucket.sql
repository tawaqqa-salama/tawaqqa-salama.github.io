-- ============================================================================
-- 047 — Design Knowledge private Storage bucket + Code Knowledge metadata
--
-- Reuses the bucket name already referenced by 025_design_intelligence
-- (di_knowledge_documents.storage_bucket DEFAULT 'design-knowledge').
-- Creates the bucket ONLY if missing. Keeps it PRIVATE (no public, no anon).
--
-- Path convention (first segment = company_id for tenant RLS):
--   {company_id}/code-knowledge/{code}/{edition}/{document_id}/{safe_file}
--
-- Additive columns for SHA / ingestion statuses. Idempotent.
-- Does NOT invent NFPA numeric values.
-- Prerequisites: public.current_app_company_id(), public.is_platform_admin()
-- ============================================================================

-- ─── 1) Private bucket design-knowledge ─────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'storage schema missing — bucket setup skipped';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'design-knowledge') THEN
    UPDATE storage.buckets
    SET public = false,
        file_size_limit = COALESCE(file_size_limit, 104857600) -- 100MB
    WHERE id = 'design-knowledge';
    RAISE NOTICE 'design-knowledge bucket exists — ensured private';
  ELSE
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'design-knowledge',
      'design-knowledge',
      false,
      104857600,
      ARRAY[
        'application/pdf',
        'application/octet-stream',
        'text/plain',
        'text/markdown',
        'image/png',
        'image/jpeg',
        'image/webp'
      ]::text[]
    );
    RAISE NOTICE 'Created private bucket design-knowledge';
  END IF;
END $$;

-- ─── 2) Tenant Storage RLS (company_id as first path segment) ───────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RETURN;
  END IF;

  IF to_regprocedure('public.current_app_company_id()') IS NULL THEN
    RAISE EXCEPTION 'public.current_app_company_id() missing — apply tenant resolver before 047';
  END IF;
  IF to_regprocedure('public.is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION 'public.is_platform_admin() missing — apply platform admin helper before 047';
  END IF;

  -- Drop only known open / prior design-knowledge policies (idempotent recreate of ours)
  DROP POLICY IF EXISTS "design_knowledge_select" ON storage.objects;
  DROP POLICY IF EXISTS "design_knowledge_insert" ON storage.objects;
  DROP POLICY IF EXISTS "design_knowledge_update" ON storage.objects;
  DROP POLICY IF EXISTS "design_knowledge_delete" ON storage.objects;
  DROP POLICY IF EXISTS "design_knowledge_anon_select" ON storage.objects;
  DROP POLICY IF EXISTS "design_knowledge_anon_insert" ON storage.objects;
  DROP POLICY IF EXISTS "design_knowledge_tenant_select" ON storage.objects;
  DROP POLICY IF EXISTS "design_knowledge_tenant_insert" ON storage.objects;
  DROP POLICY IF EXISTS "design_knowledge_tenant_update" ON storage.objects;
  DROP POLICY IF EXISTS "design_knowledge_tenant_delete" ON storage.objects;

  CREATE POLICY "design_knowledge_tenant_select"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'design-knowledge'
      AND (
        public.is_platform_admin()
        OR (storage.foldername(name))[1] = public.current_app_company_id()::text
      )
    );

  CREATE POLICY "design_knowledge_tenant_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'design-knowledge'
      AND (
        public.is_platform_admin()
        OR (storage.foldername(name))[1] = public.current_app_company_id()::text
      )
    );

  CREATE POLICY "design_knowledge_tenant_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'design-knowledge'
      AND (
        public.is_platform_admin()
        OR (storage.foldername(name))[1] = public.current_app_company_id()::text
      )
    )
    WITH CHECK (
      bucket_id = 'design-knowledge'
      AND (
        public.is_platform_admin()
        OR (storage.foldername(name))[1] = public.current_app_company_id()::text
      )
    );

  CREATE POLICY "design_knowledge_tenant_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'design-knowledge'
      AND (
        public.is_platform_admin()
        OR (storage.foldername(name))[1] = public.current_app_company_id()::text
      )
    );

  -- Explicitly no anon policies for design-knowledge
  RAISE NOTICE 'storage.design-knowledge: private tenant policies applied; anon denied by absence of policies';
END $$;

-- ─── 3) Additive document metadata for Storage ingestion ────────────────────
DO $$
BEGIN
  IF to_regclass('public.di_knowledge_documents') IS NULL THEN
    RAISE EXCEPTION 'di_knowledge_documents missing — apply DI base schema before 047';
  END IF;
END $$;

ALTER TABLE public.di_knowledge_documents
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS ingestion_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extraction_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS page_count integer,
  ADD COLUMN IF NOT EXISTS pages_extracted integer,
  ADD COLUMN IF NOT EXISTS pages_ocr integer,
  ADD COLUMN IF NOT EXISTS last_ingestion_at timestamptz,
  ADD COLUMN IF NOT EXISTS ingestion_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_sha256 text;

-- Keep extract_status (legacy) and extraction_status aligned when both exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'di_knowledge_documents'
      AND column_name = 'extract_status'
  ) THEN
    UPDATE public.di_knowledge_documents
    SET extraction_status = COALESCE(extraction_status, extract_status, 'pending')
    WHERE extraction_status IS NULL OR extraction_status = 'pending';
  END IF;
END $$;

-- Prefer mime_type when set; keep file_mime for backward compatibility
COMMENT ON COLUMN public.di_knowledge_documents.sha256 IS
  'SHA-256 of uploaded bytes (dedup / versioning). Never invent.';
COMMENT ON COLUMN public.di_knowledge_documents.ingestion_status IS
  'pending | uploaded | extracting | ocr | chunking | indexing | indexed | failed | superseded';
COMMENT ON COLUMN public.di_knowledge_documents.storage_bucket IS
  'Expected: design-knowledge (private). Access via signed/authenticated URLs only.';

CREATE INDEX IF NOT EXISTS idx_di_knowledge_docs_sha256
  ON public.di_knowledge_documents (company_id, sha256)
  WHERE deleted_at IS NULL AND sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_di_knowledge_docs_code_edition_sha
  ON public.di_knowledge_documents (company_id, code, edition, sha256)
  WHERE deleted_at IS NULL;

-- Chunk page range + extraction method (additive)
ALTER TABLE public.di_knowledge_chunks
  ADD COLUMN IF NOT EXISTS page_start integer,
  ADD COLUMN IF NOT EXISTS page_end integer,
  ADD COLUMN IF NOT EXISTS extraction_method text,
  ADD COLUMN IF NOT EXISTS edition_id uuid;

COMMENT ON COLUMN public.di_knowledge_chunks.extraction_method IS
  'text | ocr | mixed — OCR is never silently treated as native text';
