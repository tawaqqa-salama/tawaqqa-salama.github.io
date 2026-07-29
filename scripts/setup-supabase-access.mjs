/**
 * إعدادات الوصول والجداول التشغيلية الحالية.
 * للمخطط الكامل حسب وثيقة DDS v1.0 استخدم:
 *   npm run db:apply-dds
 * الوثائق: docs/dds/DDS-v1.0.md
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const tables = [
  'clients',
  'facilities',
  'projects',
  'invoices',
  'chart_of_accounts',
  'cost_centers',
  'journal_entries',
  'journal_entry_lines',
  'vouchers',
  'client_follow_ups',
  'sales_documents',
  'sales_contracts',
  'sales_returns',
];

await client.connect();

await client.query(`
  ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS owner_name text,
    ADD COLUMN IF NOT EXISTS region text,
    ADD COLUMN IF NOT EXISTS district text,
    ADD COLUMN IF NOT EXISTS street text,
    ADD COLUMN IF NOT EXISTS plot_number text,
    ADD COLUMN IF NOT EXISTS business_name text,
    ADD COLUMN IF NOT EXISTS activity_type text,
    ADD COLUMN IF NOT EXISTS land_area numeric,
    ADD COLUMN IF NOT EXISTS building_area numeric,
    ADD COLUMN IF NOT EXISTS floors_count integer,
    ADD COLUMN IF NOT EXISTS project_status text,
    ADD COLUMN IF NOT EXISTS quotation_number text,
    ADD COLUMN IF NOT EXISTS quotation_amount numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS vat_amount numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quotation_status text DEFAULT 'مسودة',
    ADD COLUMN IF NOT EXISTS financial_status text DEFAULT 'بانتظار الدفعة',
    ADD COLUMN IF NOT EXISTS payment_reference text,
    ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS assigned_engineer text,
    ADD COLUMN IF NOT EXISTS engineering_status text DEFAULT 'جديد',
    ADD COLUMN IF NOT EXISTS engineering_notes text,
    ADD COLUMN IF NOT EXISTS visit_date timestamptz,
    ADD COLUMN IF NOT EXISTS visit_status text DEFAULT 'لم تُجدول',
    ADD COLUMN IF NOT EXISTS inspection_checklist jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS final_report_status text DEFAULT 'قيد الإعداد',
    ADD COLUMN IF NOT EXISTS license_number text,
    ADD COLUMN IF NOT EXISTS license_expiry_date date,
    ADD COLUMN IF NOT EXISTS pipeline_stage text DEFAULT 'marketing',
    ADD COLUMN IF NOT EXISTS lead_status text DEFAULT 'مهتم',
    ADD COLUMN IF NOT EXISTS lead_notes text,
    ADD COLUMN IF NOT EXISTS receipt_voucher_id uuid,
    ADD COLUMN IF NOT EXISTS accounting_journal_id uuid,
    ADD COLUMN IF NOT EXISTS next_follow_up_date date,
    ADD COLUMN IF NOT EXISTS last_contact_date date,
    ADD COLUMN IF NOT EXISTS quotation_visits_count integer DEFAULT 1,
    ADD COLUMN IF NOT EXISTS sales_payment_type text DEFAULT 'نقدي',
    ADD COLUMN IF NOT EXISTS credit_balance numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS project_engineering_data jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS national_address text;
`);

await client.query(`
  CREATE TABLE IF NOT EXISTS public.client_follow_ups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id text NOT NULL,
    follow_up_date date NOT NULL DEFAULT CURRENT_DATE,
    contact_method text,
    notes text,
    status text DEFAULT 'مجدول',
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.sales_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id text NOT NULL,
    doc_type text NOT NULL CHECK (doc_type IN ('quotation', 'invoice')),
    doc_number text NOT NULL,
    subtotal numeric DEFAULT 0,
    vat_amount numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    status text DEFAULT 'مسودة',
    archived boolean DEFAULT false,
    notes text,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.sales_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id text NOT NULL,
    contract_number text NOT NULL UNIQUE,
    quotation_number text,
    contract_date date NOT NULL DEFAULT CURRENT_DATE,
    service_scope text,
    terms text,
    amount numeric DEFAULT 0,
    vat_amount numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    status text DEFAULT 'مسودة',
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.sales_returns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id text NOT NULL,
    return_number text NOT NULL UNIQUE,
    linked_doc_number text,
    amount numeric DEFAULT 0,
    reason text,
    status text DEFAULT 'مسودة',
    created_at timestamptz DEFAULT now()
  );
`);

await client.query(`
  CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    account_type text NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    parent_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.cost_centers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    department text,
    branch text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.journal_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_number text NOT NULL UNIQUE,
    entry_date date NOT NULL DEFAULT CURRENT_DATE,
    description text,
    client_id text,
    reference_type text,
    reference_id text,
    cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
    status text DEFAULT 'مرحّل',
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
    description text,
    debit numeric DEFAULT 0,
    credit numeric DEFAULT 0,
    cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS public.vouchers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_number text NOT NULL UNIQUE,
    voucher_type text NOT NULL CHECK (voucher_type IN ('receipt', 'payment')),
    voucher_date date NOT NULL DEFAULT CURRENT_DATE,
    client_id text,
    amount numeric NOT NULL DEFAULT 0,
    vat_amount numeric DEFAULT 0,
    total_amount numeric NOT NULL DEFAULT 0,
    payment_method text,
    reference_number text,
    description text,
    cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
    journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    status text DEFAULT 'مرحّل',
    created_at timestamptz DEFAULT now()
  );
`);

await client.query(`
  INSERT INTO public.chart_of_accounts (code, name, account_type, parent_id)
  SELECT seed.code, seed.name, seed.account_type, NULL
  FROM (VALUES
    ('1000', 'الأصول', 'asset'),
    ('2000', 'الخصوم', 'liability'),
    ('3000', 'حقوق الملكية', 'equity'),
    ('4000', 'الإيرادات', 'revenue'),
    ('5000', 'المصروفات', 'expense')
  ) AS seed(code, name, account_type)
  WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts existing WHERE existing.code = seed.code);
`);

await client.query(`
  INSERT INTO public.chart_of_accounts (code, name, account_type, parent_id)
  SELECT seed.code, seed.name, seed.account_type, parent.id
  FROM (VALUES
    ('1100', 'الأصول المتداولة', 'asset', '1000'),
    ('1200', 'الأصول الثابتة', 'asset', '1000'),
    ('2100', 'الخصوم المتداولة', 'liability', '2000'),
    ('3100', 'رأس المال', 'equity', '3000'),
    ('4100', 'إيرادات خدمات الاستشارات', 'revenue', '4000'),
    ('5100', 'مصروفات تشغيلية', 'expense', '5000'),
    ('5200', 'مصروفات مشتريات', 'expense', '5000')
  ) AS seed(code, name, account_type, parent_code)
  JOIN public.chart_of_accounts parent ON parent.code = seed.parent_code
  WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts existing WHERE existing.code = seed.code);
`);

await client.query(`
  INSERT INTO public.chart_of_accounts (code, name, account_type, parent_id)
  SELECT seed.code, seed.name, seed.account_type, parent.id
  FROM (VALUES
    ('1110', 'الصندوق والبنوك', 'asset', '1100'),
    ('1120', 'الذمم المدينة', 'asset', '1100'),
    ('2120', 'ضريبة القيمة المضافة المستحقة', 'liability', '2100')
  ) AS seed(code, name, account_type, parent_code)
  JOIN public.chart_of_accounts parent ON parent.code = seed.parent_code
  WHERE NOT EXISTS (SELECT 1 FROM public.chart_of_accounts existing WHERE existing.code = seed.code);
`);

await client.query(`
  INSERT INTO public.cost_centers (code, name, department, branch)
  SELECT seed.code, seed.name, seed.department, seed.branch
  FROM (VALUES
    ('CC-001', 'الفرع الرئيسي — الرياض', 'الإدارة العامة', 'الرياض'),
    ('CC-002', 'مشاريع الاستشارات', 'المشاريع', 'جميع الفروع'),
    ('CC-003', 'إدارة المبيعات', 'المبيعات', 'الرياض')
  ) AS seed(code, name, department, branch)
  WHERE NOT EXISTS (SELECT 1 FROM public.cost_centers existing WHERE existing.code = seed.code);
`);

await client.query(`
  UPDATE public.clients
  SET pipeline_stage = CASE
    WHEN financial_status IN ('تم السداد', 'معتمد مالياً') THEN 'projects'
    WHEN quotation_status IN ('معتمد', 'بانتظار السداد') THEN 'finance'
    WHEN quotation_number IS NOT NULL AND COALESCE(quotation_amount, 0) > 0 THEN 'sales'
    ELSE COALESCE(pipeline_stage, 'marketing')
  END
  WHERE pipeline_stage IS NULL OR pipeline_stage = 'marketing';
`);

for (const table of tables) {
  await client.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO anon, authenticated;
  `);
}

for (const table of tables) {
  await client.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
  await client.query(`
    DROP POLICY IF EXISTS "Allow public read ${table}" ON public.${table};
    DROP POLICY IF EXISTS "Allow public insert ${table}" ON public.${table};
    DROP POLICY IF EXISTS "Allow public update ${table}" ON public.${table};
    DROP POLICY IF EXISTS "Allow public delete ${table}" ON public.${table};
  `);
  await client.query(`
    CREATE POLICY "Allow public read ${table}" ON public.${table} FOR SELECT USING (true);
    CREATE POLICY "Allow public insert ${table}" ON public.${table} FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow public update ${table}" ON public.${table} FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY "Allow public delete ${table}" ON public.${table} FOR DELETE USING (true);
  `);
}

console.log('Supabase accounting module, workflow columns, and access configured successfully.');
await client.end();
