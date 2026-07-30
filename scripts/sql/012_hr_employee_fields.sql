-- حقول الموارد البشرية على جدول الموظفين
-- شغّله من Supabase → SQL → Run

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS salary numeric(12,2),
  ADD COLUMN IF NOT EXISTS contract_type text,
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS national_id text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS hr_notes text;

COMMENT ON COLUMN public.users.salary IS 'الراتب الشهري بالريال';
COMMENT ON COLUMN public.users.contract_type IS 'نوع العقد: دائم / محدد المدة / تجربة';
COMMENT ON COLUMN public.users.contract_start_date IS 'بداية العقد';
COMMENT ON COLUMN public.users.contract_end_date IS 'نهاية العقد';
COMMENT ON COLUMN public.users.hire_date IS 'تاريخ التعيين';
COMMENT ON COLUMN public.users.national_id IS 'رقم الهوية';
COMMENT ON COLUMN public.users.iban IS 'الآيبان';
COMMENT ON COLUMN public.users.hr_notes IS 'ملاحظات الموارد البشرية';
