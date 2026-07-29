-- DDS v1.0 — بيانات أولية + RLS + صلاحيات (متوافق مع التطبيق الحالي)

INSERT INTO public.companies (code, name, legal_name, city)
SELECT 'TWAQQA', 'منصة توقع', 'منصة توقع لاستشارات السلامة والوقاية من الحريق', 'الرياض'
WHERE NOT EXISTS (SELECT 1 FROM public.companies WHERE code = 'TWAQQA');

INSERT INTO public.branches (company_id, code, name, city)
SELECT c.id, 'HQ', 'الفرع الرئيسي — الرياض', 'الرياض'
FROM public.companies c
WHERE c.code = 'TWAQQA'
  AND NOT EXISTS (
    SELECT 1 FROM public.branches b WHERE b.company_id = c.id AND b.code = 'HQ'
  );

INSERT INTO public.ref_regions (code, name_ar) VALUES
  ('RIA', 'الرياض'),
  ('MKK', 'مكة المكرمة'),
  ('EAS', 'المنطقة الشرقية'),
  ('QAS', 'القصيم')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.ref_cities (code, name_ar, region_code) VALUES
  ('RIYADH', 'الرياض', 'RIA'),
  ('JEDDAH', 'جدة', 'MKK'),
  ('DAMMAM', 'الدمام', 'EAS'),
  ('BURAYDAH', 'بريدة', 'QAS')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.ref_activity_types (code, name_ar, occupancy_class) VALUES
  ('COMM', 'تجاري', 'mercantile'),
  ('RES', 'سكني', 'residential'),
  ('IND', 'صناعي', 'industrial'),
  ('HOT', 'فندقي', 'hotel')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.ref_building_types (code, name_ar) VALUES
  ('TOWER', 'برج'),
  ('MALL', 'مجمع تجاري'),
  ('FACTORY', 'مصنع'),
  ('VILLA', 'فيلا')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.ref_units (code, name_ar, dimension) VALUES
  ('M2', 'م²', 'area'),
  ('BAR', 'بار', 'pressure'),
  ('GPM', 'GPM', 'flow'),
  ('EA', 'قطعة', 'count')
ON CONFLICT (code) DO NOTHING;

-- دليل الحسابات الافتراضي (كما في النظام الحالي)
INSERT INTO public.chart_of_accounts (code, name, account_type, parent_id, company_id)
SELECT seed.code, seed.name, seed.account_type, NULL, c.id
FROM public.companies c
CROSS JOIN (VALUES
  ('1000', 'الأصول', 'asset'),
  ('2000', 'الخصوم', 'liability'),
  ('3000', 'حقوق الملكية', 'equity'),
  ('4000', 'الإيرادات', 'revenue'),
  ('5000', 'المصروفات', 'expense')
) AS seed(code, name, account_type)
WHERE c.code = 'TWAQQA'
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts e WHERE e.code = seed.code
  );

INSERT INTO public.chart_of_accounts (code, name, account_type, parent_id, company_id)
SELECT seed.code, seed.name, seed.account_type, parent.id, c.id
FROM public.companies c
CROSS JOIN (VALUES
  ('1100', 'الأصول المتداولة', 'asset', '1000'),
  ('1200', 'الأصول الثابتة', 'asset', '1000'),
  ('2100', 'الخصوم المتداولة', 'liability', '2000'),
  ('3100', 'رأس المال', 'equity', '3000'),
  ('4100', 'إيرادات خدمات الاستشارات', 'revenue', '4000'),
  ('5100', 'مصروفات تشغيلية', 'expense', '5000'),
  ('5200', 'مصروفات مشتريات', 'expense', '5000'),
  ('1110', 'الصندوق والبنوك', 'asset', '1100'),
  ('1120', 'الذمم المدينة', 'asset', '1100'),
  ('2120', 'ضريبة القيمة المضافة المستحقة', 'liability', '2100')
) AS seed(code, name, account_type, parent_code)
JOIN public.chart_of_accounts parent
  ON parent.code = seed.parent_code
  AND (parent.company_id = c.id OR parent.company_id IS NULL)
WHERE c.code = 'TWAQQA'
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts e WHERE e.code = seed.code
  );

INSERT INTO public.cost_centers (code, name, department, branch, company_id)
SELECT seed.code, seed.name, seed.department, seed.branch, c.id
FROM public.companies c
CROSS JOIN (VALUES
  ('CC-001', 'الفرع الرئيسي — الرياض', 'الإدارة العامة', 'الرياض'),
  ('CC-002', 'مشاريع الاستشارات', 'المشاريع', 'جميع الفروع'),
  ('CC-003', 'إدارة المبيعات', 'المبيعات', 'الرياض')
) AS seed(code, name, department, branch)
WHERE c.code = 'TWAQQA'
  AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers e WHERE e.code = seed.code
  );

INSERT INTO public.archive_policies (company_id, entity_type, retain_days, soft_delete_days, archive_after_days)
SELECT c.id, seed.entity_type, seed.retain_days, seed.soft_delete_days, seed.archive_after_days
FROM public.companies c
CROSS JOIN (VALUES
  ('clients', 2555, 90, 365),
  ('documents', 3650, 180, 730),
  ('attachments', 3650, 180, 730),
  ('audit_logs', 2555, 365, 730),
  ('projects', 3650, 180, 730)
) AS seed(entity_type, retain_days, soft_delete_days, archive_after_days)
WHERE c.code = 'TWAQQA'
  AND NOT EXISTS (
    SELECT 1 FROM public.archive_policies p
    WHERE p.company_id = c.id AND p.entity_type = seed.entity_type
  );

INSERT INTO public.workflow_definitions (company_id, code, name, entity_type, definition)
SELECT c.id, 'CLIENT_PIPELINE', 'مسار العميل من التسويق إلى الترخيص', 'clients',
  '{"states":["marketing","sales","finance","projects","completed"],"transitions":[{"from":"marketing","to":"sales"},{"from":"sales","to":"finance"},{"from":"finance","to":"projects"},{"from":"projects","to":"completed"}]}'::jsonb
FROM public.companies c
WHERE c.code = 'TWAQQA'
  AND NOT EXISTS (
    SELECT 1 FROM public.workflow_definitions w
    WHERE w.company_id = c.id AND w.code = 'CLIENT_PIPELINE'
  );

-- صلاحيات التطبيق الحالي + الجداول الجديدة
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'companies','branches','users','roles',
    'ref_cities','ref_regions','ref_activity_types','ref_building_types','ref_units','ref_manufacturers',
    'clients','client_follow_ups','sales_documents','sales_contracts','sales_returns',
    'chart_of_accounts','cost_centers','journal_entries','journal_entry_lines','vouchers','payments',
    'projects','buildings','floors','zones','rooms','safety_systems','equipment','site_visits','visit_notes',
    'documents','attachments','photos',
    'compliance_rules','compliance_exceptions','knowledge_articles',
    'ai_conversations','ai_messages','ai_suggestions','ai_model_usage_log',
    'record_versions','audit_logs','archive_policies',
    'workflow_definitions','workflow_instances','workflow_tasks','workflow_approvals','notifications',
    'integration_endpoints','integration_sync_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow public read ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow public insert ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow public update ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow public delete ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', 'Allow public read ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (true)', 'Allow public insert ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', 'Allow public update ' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (true)', 'Allow public delete ' || t, t);
  END LOOP;
END $$;
