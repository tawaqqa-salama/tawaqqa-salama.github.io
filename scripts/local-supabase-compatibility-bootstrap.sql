-- LOCAL TEST ONLY: Supabase-managed prerequisites for a plain PostgreSQL rebuild.
-- This file is intentionally outside scripts/sql and must never be applied to
-- Supabase Production or a hosted staging project.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid;
$$;

CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

-- Model hosted ownership separation: local setup plays the Storage admin role,
-- then blocks migrations from mutating the managed design-knowledge row.
DROP TRIGGER IF EXISTS reject_design_knowledge_bucket_dml ON storage.buckets;

CREATE OR REPLACE FUNCTION storage.reject_design_knowledge_bucket_dml()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_id text;
BEGIN
  target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  IF target_id = 'design-knowledge' THEN
    RAISE EXCEPTION 'Hosted parity: migrations must not write storage.buckets for design-knowledge';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'design-knowledge',
  'design-knowledge',
  false,
  1073741824,
  ARRAY[
    'application/pdf',
    'application/octet-stream',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TRIGGER reject_design_knowledge_bucket_dml
BEFORE INSERT OR UPDATE OR DELETE ON storage.buckets
FOR EACH ROW
EXECUTE FUNCTION storage.reject_design_knowledge_bucket_dml();

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT string_to_array(name, '/');
$$;
