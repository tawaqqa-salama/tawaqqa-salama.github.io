-- Auth profile fields + role seed for توقع سلامة
-- Extends public.users for username, personal page, and extra permissions

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS extra_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS page_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS page_title text,
  ADD COLUMN IF NOT EXISTS page_bio text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_username
  ON public.users (company_id, username)
  WHERE username IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_phone
  ON public.users (company_id, phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

INSERT INTO public.roles (id, company_id, code, name, permissions, is_system)
SELECT
  gen_random_uuid(),
  c.id,
  r.code,
  r.name,
  r.permissions::jsonb,
  true
FROM public.companies c
CROSS JOIN (
  VALUES
    ('admin', 'مدير النظام', '["*"]'),
    ('engineer', 'مهندس سلامة', '["dept.projects","dept.hr","dept.procurement","me.page"]'),
    ('sales', 'موظف مبيعات', '["dept.marketing","dept.sales","dept.procurement","me.page"]'),
    ('accountant', 'محاسب', '["dept.finance","me.page"]'),
    ('staff', 'موظف', '["me.page"]')
) AS r(code, name, permissions)
WHERE c.code = 'TWAQQA'
ON CONFLICT (company_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  permissions = EXCLUDED.permissions,
  is_system = true;
