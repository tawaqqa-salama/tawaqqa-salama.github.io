-- Engineering Rules Engine — configurable regulation database
-- Update rules here when SBC / NFPA / Civil Defense change — no app code deploy required.
-- Depends on: pgcrypto, companies (optional tenant scope).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Field catalog (dependency order = cascade order)
CREATE TABLE IF NOT EXISTS public.di_engineering_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  label_en text NOT NULL,
  label_ar text NOT NULL,
  value_kind text NOT NULL DEFAULT 'select', -- select | multi | computed | text
  depends_on text[] NOT NULL DEFAULT '{}',
  cascade_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Rule rows: when parent selections match → allow options and/or lock computed values
CREATE TABLE IF NOT EXISTS public.di_engineering_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  field_key text NOT NULL REFERENCES public.di_engineering_fields(field_key) ON UPDATE CASCADE,
  when_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- allowed selectable options: [{ "value", "label_en", "label_ar" }]
  allowed_options jsonb,
  -- forced / computed value (string | number | string[])
  set_value jsonb,
  lock_field boolean NOT NULL DEFAULT false,
  hide_when_empty boolean NOT NULL DEFAULT false,
  explanation_en text NOT NULL DEFAULT '',
  explanation_ar text NOT NULL DEFAULT '',
  code_refs text[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 100,
  version_label text NOT NULL DEFAULT '1.0',
  is_active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_di_eng_rules_tenant_code
  ON public.di_engineering_rules (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rule_code
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_di_eng_rules_field
  ON public.di_engineering_rules (field_key, priority)
  WHERE deleted_at IS NULL AND is_active;

CREATE INDEX IF NOT EXISTS idx_di_eng_rules_when
  ON public.di_engineering_rules USING gin (when_conditions);

COMMENT ON TABLE public.di_engineering_rules IS
  'Configurable engineering cascade rules (SBC/NFPA/Civil Defense). AI may only recommend values allowed by these rows.';

-- Seed field catalog
INSERT INTO public.di_engineering_fields (field_key, label_en, label_ar, value_kind, depends_on, cascade_order)
VALUES
  ('building_type', 'Building Type', 'نوع المبنى', 'select', '{}', 10),
  ('occupancy', 'Occupancy', 'تصنيف الإشغال', 'select', ARRAY['building_type'], 20),
  ('risk_classification', 'Risk / Hazard Classification', 'تصنيف الخطورة', 'select', ARRAY['building_type','occupancy'], 30),
  ('applicable_codes', 'Applicable Codes', 'الأكواد المطبقة', 'multi', ARRAY['building_type','occupancy','risk_classification'], 40),
  ('fire_protection_system', 'Fire Protection System', 'نظام الحماية من الحريق', 'select', ARRAY['risk_classification','applicable_codes'], 50),
  ('sprinkler_type', 'Sprinkler Type', 'نوع الرشاشات', 'select', ARRAY['fire_protection_system','risk_classification'], 60),
  ('sprinkler_density', 'Sprinkler Density', 'كثافة الرش', 'computed', ARRAY['risk_classification','sprinkler_type'], 70),
  ('water_demand', 'Water Demand', 'الطلب المائي', 'computed', ARRAY['sprinkler_density','risk_classification'], 80),
  ('pump_requirement', 'Pump Requirement', 'متطلب المضخة', 'select', ARRAY['water_demand','fire_protection_system'], 90),
  ('pump_capacity', 'Pump Capacity', 'سعة المضخة', 'computed', ARRAY['pump_requirement','water_demand'], 100),
  ('tank_size', 'Tank Size', 'حجم الخزان', 'computed', ARRAY['water_demand','pump_requirement'], 110),
  ('alarm_category', 'Alarm Category', 'فئة نظام الإنذار', 'select', ARRAY['occupancy','applicable_codes'], 120),
  ('required_reports', 'Required Reports', 'التقارير المطلوبة', 'multi', ARRAY['fire_protection_system','applicable_codes'], 130),
  ('required_drawings', 'Required Drawings', 'المخططات المطلوبة', 'multi', ARRAY['fire_protection_system','alarm_category'], 140),
  ('required_checklists', 'Required Checklists', 'قوائم التحقق المطلوبة', 'multi', ARRAY['building_type','risk_classification','applicable_codes'], 150)
ON CONFLICT (field_key) DO UPDATE SET
  label_en = EXCLUDED.label_en,
  label_ar = EXCLUDED.label_ar,
  value_kind = EXCLUDED.value_kind,
  depends_on = EXCLUDED.depends_on,
  cascade_order = EXCLUDED.cascade_order,
  updated_at = now();

-- RLS
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['di_engineering_fields', 'di_engineering_rules'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_all_auth'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_all_auth', t
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_all_anon'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)',
        t || '_all_anon', t
      );
    END IF;
  END LOOP;
END $$;
