-- Optional one-shot: if project-files already exists, relax MIME whitelist
-- so PDF uploads are not rejected for content-type mismatches.
-- Safe to run repeatedly.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'storage schema not found — skip';
    RETURN;
  END IF;

  UPDATE storage.buckets
  SET
    file_size_limit = COALESCE(file_size_limit, 52428800),
    allowed_mime_types = NULL
  WHERE id = 'project-files';

  IF NOT FOUND THEN
    RAISE NOTICE 'bucket project-files not found — create it first (script 028)';
  ELSE
    RAISE NOTICE 'project-files: allowed_mime_types cleared (allow all types)';
  END IF;
END $$;
