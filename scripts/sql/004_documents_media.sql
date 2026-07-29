-- DDS v1.0 — الأبواب ٧–٩ إدارة الوثائق والمرفقات والصور

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_number text NOT NULL,
  document_type text NOT NULL,
  title text NOT NULL,
  version_label text NOT NULL DEFAULT '1.0',
  approval_status text NOT NULL DEFAULT 'مسودة',
  owner_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  client_id text,
  retention_policy text DEFAULT 'standard_7y',
  retention_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  archived_at timestamptz,
  UNIQUE (company_id, document_number, version_label)
);

CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  related_entity_type text NOT NULL,
  related_entity_id uuid NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  mime_type text,
  file_ext text,
  size_bytes bigint,
  storage_path text NOT NULL,
  storage_bucket text DEFAULT 'attachments',
  version_label text NOT NULL DEFAULT '1.0',
  checksum_sha256 text,
  is_verified boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT attachments_file_type_chk CHECK (
    file_type IN ('image', 'pdf', 'dwg', 'rvt', 'ifc', 'docx', 'xlsx', 'video', 'other')
  )
);

CREATE TABLE IF NOT EXISTS public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.site_visits(id) ON DELETE SET NULL,
  building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  floor_id uuid REFERENCES public.floors(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES public.zones(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL,
  location_label text,
  photo_type text,
  phase text,
  taken_at timestamptz DEFAULT now(),
  gps_lat numeric,
  gps_lng numeric,
  photographer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  description text,
  notes text,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_documents_company ON public.documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON public.documents(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON public.attachments(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_photos_visit ON public.photos(visit_id);
CREATE INDEX IF NOT EXISTS idx_photos_project ON public.photos(project_id);
