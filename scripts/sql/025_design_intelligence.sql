-- DDS — Design Intelligence Center (Knowledge Base + RAG + Design Workspace)
-- Requires: pgcrypto (000). pgvector optional for production embeddings.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─── Knowledge documents (company engineering library) ─────────────────────
CREATE TABLE IF NOT EXISTS public.di_knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  discipline text,
  revision text,
  issue_date date,
  author_name text,
  version_label text DEFAULT '1.0',
  tags text[] DEFAULT '{}',
  keywords text[] DEFAULT '{}',
  project_type text,
  building_type text,
  hazard_classification text,
  applicable_codes text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  notes text,
  file_name text,
  file_mime text,
  file_size_bytes bigint,
  storage_bucket text DEFAULT 'design-knowledge',
  storage_path text,
  source_kind text DEFAULT 'upload',
  index_status text NOT NULL DEFAULT 'pending',
  indexed_at timestamptz,
  chunk_count integer NOT NULL DEFAULT 0,
  ocr_used boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_di_knowledge_docs_company
  ON public.di_knowledge_documents (company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_di_knowledge_docs_status
  ON public.di_knowledge_documents (index_status)
  WHERE deleted_at IS NULL;

-- ─── Chunks + embeddings (vector when pgvector available; jsonb fallback) ───
CREATE TABLE IF NOT EXISTS public.di_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.di_knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL DEFAULT 0,
  page_number integer,
  paragraph_ref text,
  code_reference text,
  content text NOT NULL,
  token_estimate integer,
  embedding vector(384),
  embedding_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_di_chunks_document
  ON public.di_knowledge_chunks (document_id, chunk_index);

-- ─── Per-project design workspace ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.di_design_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_name text NOT NULL,
  summary text,
  requirements text,
  building_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_classification text,
  occupancy text,
  building_height_m numeric,
  floors_count integer,
  area_m2 numeric,
  fire_protection_scope text,
  applicable_codes text[] DEFAULT '{}',
  engineering_notes text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_di_workspaces_client
  ON public.di_design_workspaces (client_id)
  WHERE deleted_at IS NULL;

-- ─── Design planner tasks (Gantt / critical path inputs) ───────────────────
CREATE TABLE IF NOT EXISTS public.di_design_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.di_design_workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner_name text,
  start_date date,
  end_date date,
  priority text DEFAULT 'medium',
  depends_on uuid[] DEFAULT '{}',
  progress_percent integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  estimated_hours numeric,
  actual_hours numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_di_tasks_workspace
  ON public.di_design_tasks (workspace_id, sort_order);

-- ─── Checklists ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.di_design_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.di_design_workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  completion_percent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Lessons learned ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.di_lessons_learned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.di_design_workspaces(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  problems text,
  solutions text,
  engineer_notes text,
  recommendations text,
  photo_refs jsonb DEFAULT '[]'::jsonb,
  document_ids uuid[] DEFAULT '{}',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Smart notifications ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.di_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.di_design_workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  severity text DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_di_notifications_user
  ON public.di_notifications (user_id, is_read, created_at DESC);

COMMENT ON TABLE public.di_knowledge_documents IS 'Design Intelligence — engineering knowledge library metadata';
COMMENT ON TABLE public.di_knowledge_chunks IS 'Chunked + embedded content for offline RAG (no internet)';
