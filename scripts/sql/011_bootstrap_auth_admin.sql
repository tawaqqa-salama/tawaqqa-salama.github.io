-- Bootstrap: جهّز جداول الموظفين + اربط أحدث مستخدم Auth كمدير
-- شغّله من Supabase → SQL → New query → Run

-- 1) الشركة والفرع
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  legal_name text,
  city text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  city text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

-- 2) جدول users إن لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) أعمدة ناقصة يحتاجها التطبيق
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS role_code text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS extra_permissions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS page_modules jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS page_title text,
  ADD COLUMN IF NOT EXISTS page_bio text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- لو عندك عمود role قديم انسخه إلى role_code
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
  ) THEN
    UPDATE public.users
    SET role_code = COALESCE(NULLIF(role_code, ''), role, 'staff')
    WHERE role_code IS NULL OR role_code = '';
  END IF;
END $$;

UPDATE public.users SET role_code = 'staff' WHERE role_code IS NULL OR role_code = '';

-- 4) بيانات الشركة/الفرع/الأدوار
INSERT INTO public.companies (code, name, legal_name, city)
SELECT 'TWAQQA', 'توقع سلامة', 'منصة توقع سلامة لاستشارات السلامة والوقاية من الحريق', 'الرياض'
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE code = 'TWAQQA');

INSERT INTO public.branches (company_id, code, name, city)
SELECT c.id, 'HQ', 'المركز الرئيسي', 'الرياض'
FROM public.companies c
WHERE c.code = 'TWAQQA'
  AND NOT EXISTS (
    SELECT 1 FROM public.branches b WHERE b.company_id = c.id AND b.code = 'HQ'
  );

INSERT INTO public.roles (company_id, code, name, permissions, is_system)
SELECT c.id, r.code, r.name, r.permissions::jsonb, true
FROM public.companies c
CROSS JOIN (VALUES
  ('admin', 'مدير النظام', '["*"]'),
  ('engineer', 'مهندس سلامة', '["dept.projects","dept.hr","me.page"]'),
  ('sales', 'موظف مبيعات', '["dept.marketing","dept.sales","me.page"]'),
  ('accountant', 'محاسب', '["dept.finance","me.page"]'),
  ('staff', 'موظف', '["me.page"]')
) AS r(code, name, permissions)
WHERE c.code = 'TWAQQA'
ON CONFLICT (company_id, code) DO NOTHING;

-- اربط كل صف مستخدم حالي بالشركة إن كان فارغاً
UPDATE public.users u
SET company_id = c.id
FROM public.companies c
WHERE c.code = 'TWAQQA'
  AND u.company_id IS NULL;

UPDATE public.users u
SET branch_id = b.id
FROM public.companies c
JOIN public.branches b ON b.company_id = c.id AND b.code = 'HQ'
WHERE c.code = 'TWAQQA'
  AND u.branch_id IS NULL;

-- 5) صلاحيات القراءة للتطبيق
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read companies" ON public.companies;
DROP POLICY IF EXISTS "Allow public insert companies" ON public.companies;
DROP POLICY IF EXISTS "Allow public update companies" ON public.companies;
DROP POLICY IF EXISTS "Allow public delete companies" ON public.companies;
CREATE POLICY "Allow public read companies" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Allow public insert companies" ON public.companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update companies" ON public.companies FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete companies" ON public.companies FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read branches" ON public.branches;
DROP POLICY IF EXISTS "Allow public insert branches" ON public.branches;
DROP POLICY IF EXISTS "Allow public update branches" ON public.branches;
DROP POLICY IF EXISTS "Allow public delete branches" ON public.branches;
CREATE POLICY "Allow public read branches" ON public.branches FOR SELECT USING (true);
CREATE POLICY "Allow public insert branches" ON public.branches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update branches" ON public.branches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete branches" ON public.branches FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read roles" ON public.roles;
DROP POLICY IF EXISTS "Allow public insert roles" ON public.roles;
DROP POLICY IF EXISTS "Allow public update roles" ON public.roles;
DROP POLICY IF EXISTS "Allow public delete roles" ON public.roles;
CREATE POLICY "Allow public read roles" ON public.roles FOR SELECT USING (true);
CREATE POLICY "Allow public insert roles" ON public.roles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update roles" ON public.roles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete roles" ON public.roles FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read users" ON public.users;
DROP POLICY IF EXISTS "Allow public insert users" ON public.users;
DROP POLICY IF EXISTS "Allow public update users" ON public.users;
DROP POLICY IF EXISTS "Allow public delete users" ON public.users;
CREATE POLICY "Allow public read users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow public insert users" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update users" ON public.users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete users" ON public.users FOR DELETE USING (true);

-- 6) اربط مستخدمي Authentication بملفات موظفين
-- أولاً: حدّث أي صف موجود بنفس الإيميل
UPDATE public.users u
SET
  auth_user_id = a.id,
  role_code = 'admin',
  is_active = true,
  company_id = COALESCE(u.company_id, c.id),
  branch_id = COALESCE(u.branch_id, b.id),
  page_modules = COALESCE(u.page_modules, '["marketing","sales","finance","hr","projects","settings"]'::jsonb),
  page_title = COALESCE(u.page_title, 'لوحة المدير'),
  username = COALESCE(u.username, 'admin'),
  job_title = COALESCE(u.job_title, 'مدير المنصة'),
  full_name = COALESCE(NULLIF(u.full_name, ''), a.raw_user_meta_data->>'full_name', 'مدير النظام')
FROM auth.users a
JOIN public.companies c ON c.code = 'TWAQQA'
JOIN public.branches b ON b.company_id = c.id AND b.code = 'HQ'
WHERE lower(u.email) = lower(a.email);

-- ثانياً: أنشئ ملفاً لأي مستخدم Auth ما زال بدون صف في users
INSERT INTO public.users (
  company_id,
  branch_id,
  auth_user_id,
  email,
  full_name,
  username,
  role_code,
  job_title,
  is_active,
  page_modules,
  page_title
)
SELECT
  c.id,
  b.id,
  a.id,
  lower(a.email),
  COALESCE(a.raw_user_meta_data->>'full_name', split_part(a.email, '@', 1), 'مدير النظام'),
  'admin',
  'admin',
  'مدير المنصة',
  true,
  '["marketing","sales","finance","hr","projects","settings"]'::jsonb,
  'لوحة المدير'
FROM auth.users a
JOIN public.companies c ON c.code = 'TWAQQA'
JOIN public.branches b ON b.company_id = c.id AND b.code = 'HQ'
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.auth_user_id = a.id
     OR lower(u.email) = lower(a.email)
);

-- تحقق سريع
SELECT
  u.email,
  u.role_code,
  u.auth_user_id,
  u.is_active,
  c.code AS company_code
FROM public.users u
LEFT JOIN public.companies c ON c.id = u.company_id
ORDER BY u.created_at DESC
LIMIT 5;
