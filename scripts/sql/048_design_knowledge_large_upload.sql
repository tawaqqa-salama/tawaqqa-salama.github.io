-- ============================================================================
-- 048 — Raise design-knowledge Storage file_size_limit for large code PDFs
--
-- CRITICAL: TUS returns HTTP 413 "Maximum size exceeded" when the object
-- Upload-Length exceeds EITHER:
--   1) storage.buckets.file_size_limit for design-knowledge, OR
--   2) the project Global file size limit (Dashboard → Storage → Settings)
--
-- 047 used COALESCE(file_size_limit, 100MiB) which does NOT raise an existing
-- smaller limit (e.g. Studio default 50MiB). This migration FORCES the bucket
-- cap to 1 GiB (must still be ≤ Global limit — raise Global first if needed).
--
-- Does NOT change NFPA numeric rules or RLS semantics.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'storage schema missing — 048 skipped';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'design-knowledge') THEN
    RAISE NOTICE 'design-knowledge bucket missing — create via 047 first';
    RETURN;
  END IF;

  UPDATE storage.buckets
  SET
    public = false,
    -- 1 GiB — force raise (do not COALESCE). Global Dashboard limit must be ≥ this.
    file_size_limit = 1073741824
  WHERE id = 'design-knowledge';

  RAISE NOTICE 'design-knowledge file_size_limit set to 1073741824 (1 GiB)';
  RAISE NOTICE 'Also set Dashboard → Storage → Settings → Global file size limit ≥ 1 GiB (or remove restrict)';
END $$;

COMMENT ON COLUMN storage.buckets.file_size_limit IS
  'Per-object max bytes. design-knowledge target 1 GiB after 048; TUS 413 means bucket or Global limit too low.';
