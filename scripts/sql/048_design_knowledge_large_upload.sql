-- ============================================================================
-- 048 — Verify design-knowledge Storage large-upload configuration
--
-- CRITICAL: TUS returns HTTP 413 "Maximum size exceeded" when the object
-- Upload-Length exceeds EITHER:
--   1) storage.buckets.file_size_limit for design-knowledge, OR
--   2) the project Global file size limit (Dashboard → Storage → Settings)
--
-- Hosted bucket administration runs through the Supabase Storage API before
-- SQL migrations. This migration is a read-only contract check and never
-- writes or comments on Supabase-managed storage.buckets.
--
-- Does NOT change NFPA numeric rules or RLS semantics.
-- ============================================================================

DO $$
DECLARE
  bucket_public boolean;
  bucket_limit bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE EXCEPTION 'storage schema missing — hosted Storage administration must run before 048';
  END IF;

  SELECT public, file_size_limit
  INTO bucket_public, bucket_limit
  FROM storage.buckets
  WHERE id = 'design-knowledge';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'design-knowledge bucket missing — run hosted Storage administration before 048';
  END IF;

  IF bucket_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'design-knowledge bucket must remain private';
  END IF;

  IF bucket_limit IS DISTINCT FROM 1073741824 THEN
    RAISE EXCEPTION 'NEEDS CONFIGURATION: design-knowledge file_size_limit must equal 1073741824 bytes';
  END IF;

  RAISE NOTICE 'design-knowledge hosted Storage contract verified: private, 1 GiB per-bucket limit';
END $$;
