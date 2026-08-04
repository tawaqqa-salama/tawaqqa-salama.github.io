-- Project engineering files — Storage bucket + policies
-- Bucket: project-files (plan drawings, hydraulic calcs)
-- Safe no-op when `storage` schema is absent (non-Supabase Postgres).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'storage schema not found — skip project-files bucket setup';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'project-files',
    'project-files',
    false,
    52428800,
    ARRAY[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'application/acad',
      'application/x-autocad',
      'image/vnd.dwg',
      'application/dxf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/octet-stream'
    ]
  )
  ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "project_files_select" ON storage.objects';
  EXECUTE $p$
    CREATE POLICY "project_files_select"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'project-files')
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS "project_files_insert" ON storage.objects';
  EXECUTE $p$
    CREATE POLICY "project_files_insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'project-files')
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS "project_files_update" ON storage.objects';
  EXECUTE $p$
    CREATE POLICY "project_files_update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'project-files')
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS "project_files_delete" ON storage.objects';
  EXECUTE $p$
    CREATE POLICY "project_files_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'project-files')
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS "project_files_anon_select" ON storage.objects';
  EXECUTE $p$
    CREATE POLICY "project_files_anon_select"
      ON storage.objects FOR SELECT
      TO anon
      USING (bucket_id = 'project-files')
  $p$;

  EXECUTE 'DROP POLICY IF EXISTS "project_files_anon_insert" ON storage.objects';
  EXECUTE $p$
    CREATE POLICY "project_files_anon_insert"
      ON storage.objects FOR INSERT
      TO anon
      WITH CHECK (bucket_id = 'project-files')
  $p$;
END $$;
