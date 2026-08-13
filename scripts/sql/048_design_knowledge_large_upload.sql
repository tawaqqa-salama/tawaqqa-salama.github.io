-- ============================================================================
-- 048 — Raise design-knowledge Storage file_size_limit for large code PDFs
--
-- Previous default in 047: 100 MiB (104857600).
-- Large NFPA / code PDFs + Safari single-PUT failures need headroom and
-- resumable (TUS) client uploads — this migration only raises the bucket cap.
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
    -- 500 MiB — enough for large code PDFs; client still uses TUS ≥ 6 MiB
    file_size_limit = 524288000
  WHERE id = 'design-knowledge';

  RAISE NOTICE 'design-knowledge file_size_limit set to 524288000 (500 MiB)';
END $$;

COMMENT ON COLUMN storage.buckets.file_size_limit IS
  'Per-object max bytes. design-knowledge target 500 MiB after 048; large uploads use TUS.';
