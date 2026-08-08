-- WhatsApp Business Platform / Cloud API — CRM integration (Tawaq)
-- Adapts to existing clients pipeline (Lead → Sales → Finance → Projects).
-- No parallel customer master: customer_id = clients.id

-- Lead attribution on existing CRM spine
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS first_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_profile_name text;

CREATE INDEX IF NOT EXISTS idx_clients_phone ON public.clients (phone);
CREATE INDEX IF NOT EXISTS idx_clients_lead_source ON public.clients (lead_source);

-- Connected WABA / phone numbers
CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  business_name text,
  phone_number text,
  phone_number_id text NOT NULL,
  waba_id text,
  access_token_encrypted text,
  webhook_verify_token text,
  app_secret_encrypted text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'error', 'pending')),
  provider text NOT NULL DEFAULT 'meta'
    CHECK (provider IN ('meta', 'twilio', '360dialog', 'other')),
  last_webhook_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone_number_id)
);

-- WhatsApp number ↔ CRM client
CREATE TABLE IF NOT EXISTS public.customer_whatsapp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  wa_contact_id text,
  profile_name text,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone_number)
);

CREATE INDEX IF NOT EXISTS idx_wa_contacts_customer
  ON public.customer_whatsapp_contacts (customer_id);

-- Conversations (Inbox threads)
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  whatsapp_account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'closed')),
  assigned_user_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer NOT NULL DEFAULT 0,
  service_window_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_conversation_account_phone
  ON public.whatsapp_conversations (whatsapp_account_id, phone_number)
  WHERE whatsapp_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_conversations_customer
  ON public.whatsapp_conversations (customer_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_status
  ON public.whatsapp_conversations (status, last_message_at DESC);

-- Messages (idempotent on whatsapp_message_id)
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  whatsapp_message_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text NOT NULL DEFAULT 'text',
  text text,
  media_url text,
  media_storage_path text,
  media_type text,
  caption text,
  template_name text,
  interactive_payload jsonb,
  sent_by_user_id uuid,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error_code text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  timestamp timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_messages_provider_id
  ON public.whatsapp_messages (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation
  ON public.whatsapp_messages (conversation_id, timestamp DESC);

-- Lightweight sales opportunity (bridges WhatsApp → existing quotes/pipeline)
CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  title text,
  service text,
  estimated_value numeric,
  probability numeric,
  expected_close_date date,
  source text NOT NULL DEFAULT 'WhatsApp',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'won', 'lost', 'converted')),
  assigned_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_customer
  ON public.crm_opportunities (customer_id);

-- Message templates (catalog; Meta approval still required on WABA)
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_name_ar text,
  category text NOT NULL DEFAULT 'UTILITY'
    CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  language text NOT NULL DEFAULT 'ar',
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'disabled')),
  meta_template_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name, language)
);

-- Campaigns
CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'cancelled', 'failed')),
  stats jsonb NOT NULL DEFAULT '{
    "sent":0,"delivered":0,"read":0,"failed":0,"replies":0,"leads":0,"opportunities":0,"conversions":0
  }'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Marketing automations
CREATE TABLE IF NOT EXISTS public.whatsapp_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  action text NOT NULL DEFAULT 'send_template',
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  delay_minutes integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- In-app notifications for WhatsApp events
CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_notifications_user
  ON public.whatsapp_notifications (user_id, created_at DESC);

-- AI extraction proposals (confirm before CRM write)
CREATE TABLE IF NOT EXISTS public.whatsapp_lead_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  proposed jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'edited', 'ignored')),
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Media attachments linked to customer + conversation (+ optional lead = same client)
CREATE TABLE IF NOT EXISTS public.whatsapp_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  file_name text,
  media_type text,
  storage_path text,
  media_url text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default Arabic utility templates (draft until Meta-approved)
INSERT INTO public.whatsapp_templates (name, display_name_ar, category, language, body, status, meta_template_name)
SELECT v.name, v.display_name_ar, v.category, 'ar', v.body, 'draft', v.name
FROM (VALUES
  ('welcome', 'ترحيب', 'UTILITY', 'مرحباً {{1}}، شكراً لتواصلكم مع توقع سلامة. كيف يمكننا مساعدتكم؟'),
  ('lead_followup', 'متابعة عميل', 'UTILITY', 'مرحباً {{1}}، نود متابعة طلبكم بخصوص {{2}}. هل يناسبكم التواصل الآن؟'),
  ('quote_reminder', 'تذكير عرض سعر', 'UTILITY', 'مرحباً {{1}}، تذكير بعرض السعر رقم {{2}}. يسعدنا الرد على استفساراتكم.'),
  ('request_documents', 'طلب مستندات', 'UTILITY', 'مرحباً {{1}}، نرجو تزويدنا بالمستندات التالية: {{2}}'),
  ('appointment_confirm', 'تأكيد موعد', 'UTILITY', 'تم تأكيد موعدكم بتاريخ {{1}} الساعة {{2}}. نراكم قريباً.'),
  ('project_status', 'إشعار حالة المشروع', 'UTILITY', 'تحديث مشروعكم {{1}}: الحالة الحالية {{2}}.'),
  ('project_welcome', 'ترحيب بالمشروع', 'UTILITY', 'مرحباً {{1}}، تم بدء العمل على مشروعكم. فريق الهندسة سيتواصل معكم.'),
  ('project_completed', 'إنجاز المشروع', 'UTILITY', 'مبروك {{1}}، اكتمل مشروع {{2}}. شكراً لثقتكم بتوقع سلامة.')
) AS v(name, display_name_ar, category, body)
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates t WHERE t.name = v.name AND t.language = 'ar'
);
