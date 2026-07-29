-- DDS v1.0 — الأبواب ١٠–١٢ محرك الامتثال، المعرفة، الذكاء الاصطناعي

CREATE TABLE IF NOT EXISTS public.compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  title text NOT NULL,
  description text,
  activity_type_id uuid REFERENCES public.ref_activity_types(id) ON DELETE SET NULL,
  building_type_id uuid REFERENCES public.ref_building_types(id) ON DELETE SET NULL,
  occupancy_class text,
  system_category text,
  reference_code text,
  reference_version text,
  priority text DEFAULT 'medium',
  is_exception_allowed boolean DEFAULT false,
  rule_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  version_no integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_rules_tenant_code_ver
  ON public.compliance_rules (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rule_code,
    version_no
  )
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.compliance_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.compliance_rules(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  reason text NOT NULL,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  status text DEFAULT 'معلق',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  article_code text NOT NULL,
  title text NOT NULL,
  category text,
  question text,
  explanation text,
  example_text text,
  scenario text,
  common_mistakes text,
  solution text,
  lessons_learned text,
  tags text[] DEFAULT '{}',
  version_no integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text,
  model_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  suggestion_type text,
  content text NOT NULL,
  analysis_result jsonb DEFAULT '{}'::jsonb,
  quality_score numeric,
  feedback_rating integer,
  feedback_text text,
  model_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ai_model_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  model_name text NOT NULL,
  operation text,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  latency_ms integer,
  success boolean DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_code ON public.compliance_rules(rule_code);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON public.knowledge_articles USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_ai_conv_company ON public.ai_conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_company ON public.ai_model_usage_log(company_id, created_at DESC);
