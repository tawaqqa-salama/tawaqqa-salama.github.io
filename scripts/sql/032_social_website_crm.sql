-- Social Media Hub + Website CMS ↔ existing CRM (clients + pipeline)
-- No parallel Customer/Lead/Project masters. customer_id = clients.id

-- ─── Lead attribution on CRM spine ───────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS first_touch_source text,
  ADD COLUMN IF NOT EXISTS first_touch_medium text,
  ADD COLUMN IF NOT EXISTS first_touch_campaign text,
  ADD COLUMN IF NOT EXISTS first_touch_content text,
  ADD COLUMN IF NOT EXISTS last_touch_source text,
  ADD COLUMN IF NOT EXISTS last_touch_medium text,
  ADD COLUMN IF NOT EXISTS last_touch_campaign text,
  ADD COLUMN IF NOT EXISTS last_touch_content text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS attribution jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_clients_utm_campaign ON public.clients (utm_campaign);
CREATE INDEX IF NOT EXISTS idx_clients_last_touch_source ON public.clients (last_touch_source);

-- ─── Unified marketing campaigns (Social + Website + WhatsApp sources) ───────
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text,
  channels text[] NOT NULL DEFAULT '{}',
  start_date date,
  end_date date,
  budget numeric(14,2),
  currency text NOT NULL DEFAULT 'SAR',
  target_audience text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  utm_campaign text,
  content_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status
  ON public.marketing_campaigns (status, start_date DESC);

-- ─── Connected social accounts (tokens encrypted at rest) ────────────────────
CREATE TABLE IF NOT EXISTS public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  platform text NOT NULL
    CHECK (platform IN (
      'whatsapp', 'instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube', 'google_business'
    )),
  provider text NOT NULL DEFAULT 'official',
  account_name text NOT NULL,
  account_id text NOT NULL,
  profile_url text,
  avatar_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'inactive', 'error', 'expired')),
  connection_status text NOT NULL DEFAULT 'disconnected'
    CHECK (connection_status IN ('connected', 'disconnected', 'error', 'expired', 'pending')),
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expiry timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, account_id)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_platform
  ON public.social_accounts (platform, connection_status);

-- Platform identity ↔ CRM client (prevents duplicate leads)
CREATE TABLE IF NOT EXISTS public.client_social_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform text NOT NULL,
  platform_user_id text NOT NULL,
  username text,
  profile_url text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_user_id)
);

CREATE INDEX IF NOT EXISTS idx_client_social_identities_customer
  ON public.client_social_identities (customer_id);

-- Unified social inbox threads
CREATE TABLE IF NOT EXISTS public.social_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  platform text NOT NULL,
  platform_thread_id text,
  contact_name text,
  contact_username text,
  contact_platform_user_id text,
  thread_type text NOT NULL DEFAULT 'message'
    CHECK (thread_type IN ('message', 'comment', 'mention', 'review')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'closed')),
  assigned_user_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  marketing_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_conversations_customer
  ON public.social_conversations (customer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_conversations_platform
  ON public.social_conversations (platform, status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.social_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.social_conversations(id) ON DELETE CASCADE,
  platform_message_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text NOT NULL DEFAULT 'text',
  text text,
  media_url text,
  media_storage_path text,
  sent_by_user_id uuid,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error_code text,
  error_message text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_messages_platform_id
  ON public.social_messages (conversation_id, platform_message_id)
  WHERE platform_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_messages_conversation
  ON public.social_messages (conversation_id, created_at DESC);

-- Content manager + calendar
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  marketing_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  title text,
  content text NOT NULL DEFAULT '',
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  platforms text[] NOT NULL DEFAULT '{}',
  publish_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  created_by uuid,
  ai_suggested boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_publish
  ON public.social_posts (status, publish_at);

CREATE TABLE IF NOT EXISTS public.social_post_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'unsupported')),
  platform_post_id text,
  published_at timestamptz,
  error_message text,
  unsupported_reason text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_post_targets_post
  ON public.social_post_targets (post_id);

-- Analytics snapshots (provider sync)
CREATE TABLE IF NOT EXISTS public.social_analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  followers integer,
  followers_growth integer,
  posts integer,
  views bigint,
  reach bigint,
  impressions bigint,
  engagement bigint,
  comments integer,
  messages integer,
  clicks integer,
  leads integer,
  spend numeric(14,2),
  revenue_attributed numeric(14,2),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (social_account_id, period_start, period_end)
);

-- ─── Website CMS (light) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  website_name text NOT NULL,
  domain text,
  logo_url text,
  favicon_url text,
  company_name text,
  phone text,
  whatsapp text,
  email text,
  address text,
  working_hours text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  connection_status text NOT NULL DEFAULT 'not_connected'
    CHECK (connection_status IN ('connected', 'not_connected', 'error')),
  public_form_token text,
  seo_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  content text NOT NULL DEFAULT '',
  seo_title text,
  meta_description text,
  canonical_url text,
  og_title text,
  og_description text,
  og_image text,
  featured_image text,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS public.website_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  crm_service_key text,
  icon text,
  published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  seo_title text,
  meta_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

-- Showcase published projects — references existing clients/projects, no second project DB
CREATE TABLE IF NOT EXISTS public.website_project_showcases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  sector text,
  city text,
  services text[] NOT NULL DEFAULT '{}',
  image_url text,
  project_date date,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS public.website_blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.website_blog_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL,
  content text NOT NULL DEFAULT '',
  excerpt text,
  author text,
  tags text[] NOT NULL DEFAULT '{}',
  featured_image text,
  seo_title text,
  meta_description text,
  og_image text,
  published boolean NOT NULL DEFAULT false,
  publish_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS public.website_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  thank_you_message text,
  notify_email text,
  default_service_key text,
  marketing_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS public.website_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.website_forms(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  landing_page text,
  referrer text,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_form_submissions_customer
  ON public.website_form_submissions (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.website_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.website_sites(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text,
  public_url text,
  mime_type text,
  size_bytes integer,
  alt_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Customer timeline events (unified Social / Website / CRM)
CREATE TABLE IF NOT EXISTS public.customer_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text,
  title text NOT NULL,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  related_entity_type text,
  related_entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_timeline_customer
  ON public.customer_timeline_events (customer_id, occurred_at DESC);

-- Marketing audit log
CREATE TABLE IF NOT EXISTS public.marketing_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_audit_created
  ON public.marketing_audit_logs (created_at DESC);
