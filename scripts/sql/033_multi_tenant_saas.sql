-- Multi-Tenant SaaS foundation (companies = tenants)
-- Preserves existing TWAQQA data; adds subscription, memberships, modules, audit.

-- ─── Extend companies (tenant profile) ───────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'SA',
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS default_language text NOT NULL DEFAULT 'ar'
    CHECK (default_language IN ('ar', 'en', 'id')),
  ADD COLUMN IF NOT EXISTS secondary_language text
    CHECK (secondary_language IS NULL OR secondary_language IN ('ar', 'en', 'id')),
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Riyadh',
  ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'dd/MM/yyyy',
  ADD COLUMN IF NOT EXISTS number_format text NOT NULL DEFAULT 'ar-SA',
  ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT 'safety_engineering',
  ADD COLUMN IF NOT EXISTS brand_primary text,
  ADD COLUMN IF NOT EXISTS brand_secondary text,
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS tax_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trial', 'suspended', 'cancelled', 'pending')),
  ADD COLUMN IF NOT EXISTS subscription_plan text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'cancelled', 'none')),
  ADD COLUMN IF NOT EXISTS subscription_start timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_end timestamptz,
  ADD COLUMN IF NOT EXISTS max_users integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS max_projects integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_storage_mb integer NOT NULL DEFAULT 5120,
  ADD COLUMN IF NOT EXISTS max_documents integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS platform_notes text;

-- Slug from code for existing rows
UPDATE public.companies
SET slug = lower(regexp_replace(code, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_slug
  ON public.companies (slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- ─── Platform plans ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saas_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  billing_interval text NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'yearly')),
  max_users integer NOT NULL DEFAULT 10,
  max_projects integer NOT NULL DEFAULT 100,
  max_storage_mb integer NOT NULL DEFAULT 1024,
  max_documents integer NOT NULL DEFAULT 1000,
  enabled_modules text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.saas_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'none')),
  billing_interval text NOT NULL DEFAULT 'monthly',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  trial_ends_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_company
  ON public.tenant_subscriptions (company_id, status);

-- ─── Feature modules catalog + per-tenant flags ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_modules (
  code text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text,
  name_id text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_core boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.tenant_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_code text NOT NULL REFERENCES public.platform_modules(code) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, module_code)
);

CREATE INDEX IF NOT EXISTS idx_tenant_modules_company
  ON public.tenant_modules (company_id, enabled);

-- ─── Memberships (user ↔ tenant, scalable multi-company) ─────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_code text NOT NULL DEFAULT 'staff',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'suspended', 'removed')),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user
  ON public.tenant_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_company
  ON public.tenant_memberships (company_id, status);

-- Platform-level flag on users (SUPER_ADMIN not bound to one tenant)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_language text
    CHECK (preferred_language IS NULL OR preferred_language IN ('ar', 'en', 'id'));

-- ─── SaaS audit log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saas_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_audit_created
  ON public.saas_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_audit_company
  ON public.saas_audit_logs (company_id, created_at DESC);

-- Support impersonation sessions (explicit + audited)
CREATE TABLE IF NOT EXISTS public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ─── Procurement tenant columns (gap fill) ───────────────────────────────────
ALTER TABLE public.procurement_vendors
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.procurement_rfqs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- ─── Seed plans ──────────────────────────────────────────────────────────────
INSERT INTO public.saas_plans (code, name, description, price, currency, billing_interval, max_users, max_projects, max_storage_mb, max_documents, enabled_modules)
VALUES
  ('trial', 'Trial', '14-day trial', 0, 'USD', 'monthly', 5, 25, 512, 200,
   ARRAY['crm','marketing','projects','documents','reports','settings']),
  ('starter', 'Starter', 'Small teams', 49, 'USD', 'monthly', 10, 100, 2048, 1000,
   ARRAY['crm','marketing','projects','documents','reports','settings']),
  ('growth', 'Growth', 'Growing offices', 149, 'USD', 'monthly', 40, 500, 10240, 10000,
   ARRAY['crm','marketing','projects','documents','reports','finance','procurement','hr','settings','social_media','website']),
  ('enterprise', 'Enterprise', 'Full platform', 399, 'USD', 'monthly', 200, 5000, 102400, 100000,
   ARRAY['crm','marketing','projects','documents','reports','finance','finance_zatca','procurement','hr','design','settings','social_media','website','whatsapp'])
ON CONFLICT (code) DO NOTHING;

-- ─── Seed modules ────────────────────────────────────────────────────────────
INSERT INTO public.platform_modules (code, name_en, name_ar, name_id, sort_order, is_core) VALUES
  ('crm', 'CRM', 'إدارة العملاء', 'CRM', 10, true),
  ('marketing', 'Marketing', 'التسويق', 'Pemasaran', 20, false),
  ('whatsapp', 'WhatsApp', 'واتساب', 'WhatsApp', 25, false),
  ('social_media', 'Social Media', 'السوشال ميديا', 'Media Sosial', 30, false),
  ('website', 'Website', 'الموقع', 'Situs Web', 35, false),
  ('projects', 'Projects', 'المشاريع', 'Proyek', 40, true),
  ('documents', 'Documents', 'المستندات', 'Dokumen', 50, true),
  ('reports', 'Reports', 'التقارير', 'Laporan', 60, true),
  ('finance', 'Finance', 'المالية', 'Keuangan', 70, false),
  ('finance_zatca', 'ZATCA E-Invoicing', 'الفوترة الإلكترونية', 'Faktur Elektronik ZATCA', 75, false),
  ('procurement', 'Procurement', 'المشتريات', 'Pengadaan', 80, false),
  ('hr', 'HR', 'الموارد البشرية', 'SDM', 90, false),
  ('design', 'Design Intelligence', 'الذكاء التصميمي', 'Desain Cerdas', 100, false),
  ('settings', 'Settings', 'الإعدادات', 'Pengaturan', 110, true)
ON CONFLICT (code) DO NOTHING;

-- ─── Migrate existing TWAQQA company ─────────────────────────────────────────
UPDATE public.companies c
SET
  slug = COALESCE(c.slug, 'tawaqqa'),
  country = COALESCE(c.country, 'SA'),
  default_language = COALESCE(NULLIF(c.default_language, ''), 'ar'),
  secondary_language = COALESCE(c.secondary_language, 'en'),
  default_currency = COALESCE(NULLIF(c.default_currency, ''), 'SAR'),
  timezone = COALESCE(NULLIF(c.timezone, ''), 'Asia/Riyadh'),
  date_format = COALESCE(c.date_format, 'dd/MM/yyyy'),
  number_format = COALESCE(c.number_format, 'ar-SA'),
  industry = COALESCE(NULLIF(c.industry, ''), 'safety_engineering'),
  status = CASE WHEN c.is_active THEN 'active' ELSE 'suspended' END,
  subscription_status = 'active',
  subscription_plan = COALESCE(c.subscription_plan, 'enterprise'),
  subscription_start = COALESCE(c.subscription_start, c.created_at, now()),
  max_users = COALESCE(NULLIF(c.max_users, 0), 200),
  max_projects = COALESCE(NULLIF(c.max_projects, 0), 5000),
  max_storage_mb = COALESCE(NULLIF(c.max_storage_mb, 0), 102400),
  max_documents = COALESCE(NULLIF(c.max_documents, 0), 100000)
WHERE c.code = 'TWAQQA' OR c.slug = 'tawaqqa' OR lower(c.name) LIKE '%توقع%';

-- Enable all modules for existing TWAQQA
INSERT INTO public.tenant_modules (company_id, module_code, enabled)
SELECT c.id, m.code, true
FROM public.companies c
CROSS JOIN public.platform_modules m
WHERE (c.code = 'TWAQQA' OR c.slug = 'tawaqqa')
ON CONFLICT (company_id, module_code) DO UPDATE SET enabled = true;

-- Subscription row for TWAQQA
INSERT INTO public.tenant_subscriptions (company_id, plan_id, status, billing_interval, starts_at)
SELECT c.id, p.id, 'active', 'yearly', COALESCE(c.created_at, now())
FROM public.companies c
JOIN public.saas_plans p ON p.code = 'enterprise'
WHERE (c.code = 'TWAQQA' OR c.slug = 'tawaqqa')
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_subscriptions s WHERE s.company_id = c.id AND s.status = 'active'
  );

-- Backfill memberships from users.company_id
INSERT INTO public.tenant_memberships (user_id, company_id, role_code, status, is_default)
SELECT u.id, u.company_id,
  CASE
    WHEN u.role_code = 'admin' THEN 'tenant_admin'
    ELSE u.role_code
  END,
  CASE WHEN u.is_active THEN 'active' ELSE 'suspended' END,
  true
FROM public.users u
WHERE u.company_id IS NOT NULL
ON CONFLICT (user_id, company_id) DO NOTHING;

-- Map legacy admin → tenant_admin for clarity (keep admin working via aliases in app)
UPDATE public.users
SET role_code = 'tenant_admin'
WHERE role_code = 'admin'
  AND COALESCE(is_platform_admin, false) = false;

UPDATE public.tenant_memberships
SET role_code = 'tenant_admin'
WHERE role_code = 'admin';

-- Backfill procurement company_id from first/active company when null
UPDATE public.procurement_vendors v
SET company_id = c.id
FROM public.companies c
WHERE v.company_id IS NULL
  AND (c.code = 'TWAQQA' OR c.slug = 'tawaqqa');

UPDATE public.purchase_orders po
SET company_id = c.id
FROM public.companies c
WHERE po.company_id IS NULL
  AND (c.code = 'TWAQQA' OR c.slug = 'tawaqqa');

UPDATE public.procurement_rfqs r
SET company_id = c.id
FROM public.companies c
WHERE r.company_id IS NULL
  AND (c.code = 'TWAQQA' OR c.slug = 'tawaqqa');

-- Indexes for common tenant filters
CREATE INDEX IF NOT EXISTS idx_clients_company ON public.clients (company_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_created ON public.clients (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_company ON public.users (company_id);

-- Seed Indonesian pilot tenant (empty — ready for onboarding)
INSERT INTO public.companies (
  code, slug, name, legal_name, country, city, default_language, secondary_language,
  default_currency, timezone, date_format, number_format, industry, status,
  subscription_status, subscription_plan, subscription_start, subscription_end,
  max_users, max_projects, max_storage_mb, max_documents, is_active
)
SELECT
  'IDN-PILOT', 'idn-realestate-pilot', 'Indonesia Real Estate Pilot',
  'Indonesia Real Estate Development Office',
  'ID', 'Jakarta', 'en', 'id', 'IDR', 'Asia/Jakarta', 'dd/MM/yyyy', 'en-ID',
  'real_estate', 'trial', 'trial', 'trial', now(), now() + interval '14 days',
  10, 50, 2048, 1000, true
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE code = 'IDN-PILOT' OR slug = 'idn-realestate-pilot');

INSERT INTO public.tenant_modules (company_id, module_code, enabled)
SELECT c.id, m.code, m.code = ANY (ARRAY['crm','marketing','projects','documents','reports','settings'])
FROM public.companies c
CROSS JOIN public.platform_modules m
WHERE c.code = 'IDN-PILOT'
ON CONFLICT (company_id, module_code) DO NOTHING;

INSERT INTO public.tenant_subscriptions (company_id, plan_id, status, billing_interval, starts_at, trial_ends_at)
SELECT c.id, p.id, 'trial', 'monthly', now(), now() + interval '14 days'
FROM public.companies c
JOIN public.saas_plans p ON p.code = 'trial'
WHERE c.code = 'IDN-PILOT'
  AND NOT EXISTS (SELECT 1 FROM public.tenant_subscriptions s WHERE s.company_id = c.id);

-- ─── RLS for SaaS control-plane tables ───────────────────────────────────────
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_memberships_self ON public.tenant_memberships;
CREATE POLICY tenant_memberships_self ON public.tenant_memberships
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_app_company_id()
    OR user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS tenant_modules_tenant ON public.tenant_modules;
CREATE POLICY tenant_modules_tenant ON public.tenant_modules
  FOR SELECT TO authenticated
  USING (company_id = public.current_app_company_id());

DROP POLICY IF EXISTS tenant_subscriptions_tenant ON public.tenant_subscriptions;
CREATE POLICY tenant_subscriptions_tenant ON public.tenant_subscriptions
  FOR SELECT TO authenticated
  USING (company_id = public.current_app_company_id());

DROP POLICY IF EXISTS saas_audit_tenant ON public.saas_audit_logs;
CREATE POLICY saas_audit_tenant ON public.saas_audit_logs
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_app_company_id()
    OR company_id IS NULL
  );

-- Plans / modules catalog: readable by authenticated users
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_plans_read ON public.saas_plans;
CREATE POLICY saas_plans_read ON public.saas_plans
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS platform_modules_read ON public.platform_modules;
CREATE POLICY platform_modules_read ON public.platform_modules
  FOR SELECT TO authenticated USING (true);
