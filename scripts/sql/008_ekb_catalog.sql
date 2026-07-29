-- EKB v1.0 — كتالوج قاعدة المعرفة الهندسية (محتوى معرفي، ليس قواعد تنفيذية)
-- يتوافق مع docs/ekb/EKB-v1.0.md وجداول DDS (knowledge_articles, ref_*, compliance_rules)

CREATE TABLE IF NOT EXISTS public.ekb_code_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text,
  authority text NOT NULL,
  edition text,
  effective_date date,
  cancelled_date date,
  coverage_areas text[] DEFAULT '{}',
  compliance_link_notes text,
  is_active boolean NOT NULL DEFAULT true,
  ekb_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ekb_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text,
  classification text,
  occupancy_class text,
  risk_level text NOT NULL DEFAULT 'متوسط',
  description text,
  required_systems text[] DEFAULT '{}',
  optional_systems text[] DEFAULT '{}',
  forbidden_systems text[] DEFAULT '{}',
  required_docs text[] DEFAULT '{}',
  required_reports text[] DEFAULT '{}',
  special_requirements text,
  technical_notes text,
  ref_activity_type_id uuid REFERENCES public.ref_activity_types(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  ekb_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ekb_hazardous_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text,
  classification text,
  hazard_level text,
  physical_state text,
  storage_method text,
  extinguishing_agent text,
  suitable_systems text[] DEFAULT '{}',
  forbidden_systems text[] DEFAULT '{}',
  protection_means text,
  precautions text,
  is_active boolean NOT NULL DEFAULT true,
  ekb_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ekb_systems_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_code text NOT NULL UNIQUE,
  library text NOT NULL CHECK (library IN ('suppression', 'alarm', 'equipment', 'other')),
  name_ar text NOT NULL,
  name_en text,
  description text,
  typical_use text,
  advantages text,
  limitations text,
  requirements text,
  related_equipment text[] DEFAULT '{}',
  reference_drawings text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  ekb_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ekb_faq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faq_code text NOT NULL UNIQUE,
  question text NOT NULL,
  answer text NOT NULL,
  topic_tags text[] DEFAULT '{}',
  related_activity_code text,
  is_active boolean NOT NULL DEFAULT true,
  ekb_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ekb_common_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_code text NOT NULL UNIQUE,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  rejection_reason text,
  remediation text,
  is_active boolean NOT NULL DEFAULT true,
  ekb_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ekb_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  facility_type text NOT NULL,
  summary text,
  typical_systems text[] DEFAULT '{}',
  key_risks text[] DEFAULT '{}',
  decision_notes text,
  is_active boolean NOT NULL DEFAULT true,
  ekb_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ekb_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  project_types text[] DEFAULT '{}',
  likelihood text,
  severity text,
  prevention text,
  corrective_actions text,
  is_active boolean NOT NULL DEFAULT true,
  ekb_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ekb_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_code text NOT NULL UNIQUE,
  update_type text NOT NULL,
  title text NOT NULL,
  summary text,
  effective_date date,
  system_impact text,
  source_ref text,
  ekb_version text NOT NULL DEFAULT '1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- بذور أكواد ومعايير
INSERT INTO public.ekb_code_references (code, name_ar, name_en, authority, edition, coverage_areas, compliance_link_notes)
VALUES
  ('SBC', 'الكود السعودي للبناء', 'Saudi Building Code', 'اللجنة الوطنية لكود البناء السعودي', 'الإصدار الساري', ARRAY['بناء','سلامة','إشغال'], 'مرجع أساس لقواعد الامتثال في المنصة'),
  ('AHJ', 'لوائح وتعليمات الجهات المختصة', 'Authority Having Jurisdiction', 'الجهات المختصة بالمملكة', 'تعاميم سارية', ARRAY['تراخيص','سلامة'], 'تُراجع مع كل مشروع حسب النطاق الجغرافي'),
  ('NFPA', 'معايير NFPA المعتمدة عند الطلب', 'NFPA Standards', 'NFPA', 'حسب المشروع', ARRAY['إطفاء','إنذار'], 'تُستخدم عندما يشترطها المشروع أو المواصفات'),
  ('UL', 'معايير UL', 'UL Standards', 'UL', 'حسب المنتج', ARRAY['معدات','شهادات'], 'ربط بمكتبة المنتجات المعتمدة'),
  ('FM', 'معايير FM', 'FM Approvals', 'FM', 'حسب المنتج', ARRAY['معدات','اعتماد'], 'للمشاريع التي تشترط FM'),
  ('SASO', 'المواصفات القياسية السعودية', 'SASO', 'الهيئة السعودية للمواصفات', 'ساري', ARRAY['منتجات','سلامة'], 'متطلبات السوق المحلي')
ON CONFLICT (code) DO NOTHING;

-- بذور أنشطة
INSERT INTO public.ekb_activities (
  activity_code, name_ar, name_en, classification, occupancy_class, risk_level, description,
  required_systems, optional_systems, forbidden_systems, required_docs, required_reports, technical_notes
) VALUES
  ('ACT-COMM', 'تجاري', 'Commercial', 'نشاط', 'mercantile', 'متوسط',
   'محلات ومجمعات تجارية',
   ARRAY['إنذار','طفايات','إضاءة طوارئ'], ARRAY['رشاشات','شفط دخان','نظام مطبخ'], ARRAY['غمر CO2 في فراغات مأهولة'],
   ARRAY['مخططات','مواصفات'], ARRAY['تقرير فني','تقرير زيارة'], 'راجع عتبات المساحة في SBC'),
  ('ACT-RES', 'سكني', 'Residential', 'نشاط', 'residential', 'منخفض',
   'سكن وشقق ومجمعات سكنية',
   ARRAY['كواشف/إنذار حسب النوع','طفايات','مخارج'], ARRAY['رشاشات'], ARRAY[]::text[],
   ARRAY['مخططات معمارية'], ARRAY['تقرير فني'], 'تمييز بين سكن عائلي ومشترك'),
  ('ACT-IND', 'صناعي', 'Industrial', 'نشاط', 'industrial', 'عالٍ',
   'مصانع وورش',
   ARRAY['إنذار','إطفاء مناسب للخطر','طفايات'], ARRAY['رغوة','غاز نظيف'], ARRAY['أنظمة غير متوافقة مع مواد العملية'],
   ARRAY['مخططات عملية','قائمة مواد'], ARRAY['تقرير مخاطر','تقرير فني'], 'اربط بمكتبة المواد الخطرة'),
  ('ACT-HOT', 'فندقي', 'Hotel', 'نشاط', 'hotel', 'متوسط',
   'فنادق وإيواء',
   ARRAY['إنذار','رشاشات حسب الاشتراط','إضاءة طوارئ','مخارج'], ARRAY['شفط دخان'], ARRAY[]::text[],
   ARRAY['مخططات','خطة إخلاء'], ARRAY['تقرير فني','تقرير نهائي'], 'مراعاة الإشغال الليلي'),
  ('ACT-WH', 'مستودع', 'Warehouse', 'نشاط', 'storage', 'عالٍ',
   'تخزين وبضائع',
   ARRAY['إنذار','إطفاء حسب فئة التخزين'], ARRAY['رغوة','مراقبة'], ARRAY['غاز في فراغات غير محكمة دون دراسة'],
   ARRAY['تصنيف تخزين','ارتفاعات رفوف'], ARRAY['تقرير فني'], 'ارتفاع التخزين يغيّر التصميم'),
  ('ACT-FUEL', 'محطة وقود', 'Fuel Station', 'نشاط', 'fuel', 'عالٍ جداً',
   'محطات وقود وخزانات',
   ARRAY['طفايات مناسبة','نظام رغوة/مناسب','إنذار'], ARRAY['مراقبة'], ARRAY['رش ماء غير مدروس على وقود سائل'],
   ARRAY['مخطط موقع','خزانات'], ARRAY['تقرير مخاطر'], 'تنسيق مع اشتراطات الجهة المختصة'),
  ('ACT-DC', 'مركز بيانات', 'Data Center', 'نشاط', 'data_center', 'عالٍ',
   'مراكز بيانات',
   ARRAY['إنذار مبكر','غاز نظيف/مناسب','طفايات'], ARRAY['شفط'], ARRAY['رش ماء على معدات حية دون تصميم مخصص'],
   ARRAY['مخططات غرف','مواصفات غاز'], ARRAY['تقرير فني'], 'حماية المعدات أولوية مع سلامة الأشخاص'),
  ('ACT-EDU', 'تعليمي', 'Educational', 'نشاط', 'educational', 'متوسط',
   'مدارس وجامعات',
   ARRAY['إنذار','طفايات','إضاءة طوارئ','مخارج'], ARRAY['رشاشات'], ARRAY[]::text[],
   ARRAY['خطة إخلاء'], ARRAY['تقرير فني','تقرير زيارة'], 'كثافة إشغال عالية في الفصول')
ON CONFLICT (activity_code) DO NOTHING;

UPDATE public.ekb_activities a
SET ref_activity_type_id = r.id
FROM public.ref_activity_types r
WHERE (a.activity_code = 'ACT-COMM' AND r.code = 'COMM')
   OR (a.activity_code = 'ACT-RES' AND r.code = 'RES')
   OR (a.activity_code = 'ACT-IND' AND r.code = 'IND')
   OR (a.activity_code = 'ACT-HOT' AND r.code = 'HOT');

INSERT INTO public.ekb_hazardous_materials (
  material_code, name_ar, name_en, classification, hazard_level, physical_state,
  storage_method, extinguishing_agent, suitable_systems, forbidden_systems, protection_means, precautions
) VALUES
  ('HM-DIESEL', 'ديزل', 'Diesel', 'سائل قابل للاشتعال', 'عالٍ', 'سائل', 'خزانات معتمدة وتهوية', 'رغوة / بودرة', ARRAY['رغوة','طفايات'], ARRAY['ماء غير مدروس كرش مباشر'], 'حصر وتأريض', 'منع مصادر الاشتعال'),
  ('HM-LPG', 'غاز LPG', 'LPG', 'غاز مسال', 'عالٍ جداً', 'غاز', 'أسطوانات/خزانات معتمدة', 'بودرة / CO2 حسب الحالة', ARRAY['كشف تسرب','طفايات'], ARRAY['رش ماء كإطفاء أساسي للغاز'], 'تهوية وكشف', 'مسافات فصل'),
  ('HM-SOLV', 'مذيبات', 'Solvents', 'سوائل قابلة للاشتعال', 'عالٍ', 'سائل', 'خزائن مقاومة للهب', 'رغوة / بودرة / CO2', ARRAY['طفايات','تهوية'], ARRAY['تخزين مع مؤكسدات'], 'حصر ثانوي', 'ملصقات وSDS'),
  ('HM-BATT', 'بطاريات', 'Batteries', 'طاقة مخزنة', 'متوسط-عالٍ', 'صلب/كهربائي', 'غرف مخصصة وتهوية', 'حسب التقنية (لا ماء على كهرباء حية)', ARRAY['كشف حراري/دخان','طفايات مناسبة'], ARRAY['ماء على أعطال كهربائية حية'], 'فصل كهربائي', 'إدارة حرارية'),
  ('HM-CHEM', 'كيماويات عامة', 'Chemicals', 'متنوع', 'حسب SDS', 'متنوع', 'حسب توافق المواد', 'حسب SDS', ARRAY['حسب الخطر'], ARRAY['خلط غير متوافق'], 'فصل مجموعات', 'مراجعة SDS إلزامية'),
  ('HM-OIL', 'زيوت طبخ', 'Cooking oil', 'زيوت قابلة للاشتعال', 'متوسط', 'سائل', 'مطابخ تجارية', 'نظام مطبخ رطب كيميائي', ARRAY['نظام مطبخ','طفاية مناسبة'], ARRAY['ماء على زيت مشتعل'], 'شفاطات وصيانة', 'تنظيف دوري للشحوم')
ON CONFLICT (material_code) DO NOTHING;

INSERT INTO public.ekb_systems_catalog (system_code, library, name_ar, name_en, description, typical_use, advantages, limitations) VALUES
  ('SUP-SPK', 'suppression', 'الرش الآلي', 'Automatic sprinkler', 'شبكة رشاشات تُفعّل بالحرارة', 'معظم الإشغالات عند العتبات', 'فعالية مثبتة', 'حساسية للتجميد/التصميم الخاطئ'),
  ('SUP-STP', 'suppression', 'شبكات الحريق / Standpipe', 'Standpipe', 'مأخذ رجال إطفاء', 'مبانٍ متعددة الطوابق', 'دعم الإطفاء اليدوي', 'لا يغني عن الرشاشات عند الإلزام'),
  ('SUP-CLEAN', 'suppression', 'غازات نظيفة', 'Clean agent', 'إطفاء غازي للفراغات الخاصة', 'مراكز بيانات / غرف تحكم', 'Minimal residue', 'يتطلب إحكام الغرفة وحساب تركيز'),
  ('SUP-CO2', 'suppression', 'ثاني أكسيد الكربون', 'CO2', 'إطفاء CO2', 'فراغات غير مأهولة عادة', 'فعال على بعض المخاطر', 'خطر على الأرواح في الفراغات المأهولة'),
  ('SUP-FOAM', 'suppression', 'الرغوة', 'Foam', 'إطفاء رغوي', 'وقود وسوائل قابلة للاشتعال', 'غطاء بخاري', 'صيانة ووسط رغوي'),
  ('ALM-DET', 'alarm', 'كواشف الدخان/الحرارة', 'Detectors', 'أجهزة كشف', 'إنذار مبكر', 'كشف مبكر', 'إنذارات كاذبة إن أُسيء اختيار النوع'),
  ('ALM-FACP', 'alarm', 'لوحة التحكم', 'FACP', 'لوحة إنذار رئيسية', 'كل نظام إنذار', 'إدارة المناطق', 'تحتاج صيانة وبطاريات'),
  ('EQ-PUMP', 'equipment', 'مضخة حريق', 'Fire pump', 'مضخة تغذية الشبكة', 'عند الحاجة الهيدروليكية', 'ضغط وتدفق مضمون', 'غرفة مضخات واشتراطات تشغيل')
ON CONFLICT (system_code) DO NOTHING;

INSERT INTO public.ekb_faq (faq_code, question, answer, topic_tags) VALUES
  ('FAQ-01', 'متى يُلزم الرش الآلي؟', 'يُحدد وفق الكود السعودي واشتراطات الجهة المختصة ونوع الإشغال والمساحة والارتفاع؛ راجع عتبات النشاط في مكتبة الأنشطة.', ARRAY['رشاشات','SBC']),
  ('FAQ-02', 'هل NFPA إلزامي دائماً؟', 'ليس دائماً؛ يُعتمد عند اشتراط المشروع أو المواصفات أو الجهة. الأساس المحلي هو SBC ولوائح الجهة المختصة.', ARRAY['NFPA','مراجع']),
  ('FAQ-03', 'ما الفرق بين إنذار وكشف؟', 'الكشف هو الإحساس بالحدث؛ الإنذار يشمل الإشعار والتنبيه ولوحة التحكم ونقاط النداء والأجهزة الصوتية/المرئية.', ARRAY['إنذار']),
  ('FAQ-04', 'هل يجوز CO2 في غرفة مأهولة؟', 'عادة لا يُفضّل في الفراغات المأهولة بسبب خطر الاختناق؛ تُدرس البدائل (غاز نظيف) أو الضوابط الصارمة.', ARRAY['CO2','سلامة']),
  ('FAQ-05', 'ماذا أرفق مع عرض السعر؟', 'نطاق الخدمة، الافتراضات، الاستثناءات، مدة الإنجاز، وربط بنماذج المنصة (عرض سعر/عقد).', ARRAY['نماذج','مبيعات'])
ON CONFLICT (faq_code) DO NOTHING;

INSERT INTO public.ekb_common_errors (error_code, category, title, description, rejection_reason, remediation) VALUES
  ('ERR-DES-01', 'تصميم', 'تجاهل تصنيف الإشغال', 'تصميم أنظمة دون تثبيت نوع الإشغال', 'عدم وضوح الإشغال', 'تثبيت النشاط ومكتبة الإشغال قبل الحسابات'),
  ('ERR-HYD-01', 'حسابات', 'إهمال الفواقد', 'حساب ضغط دون فواقد مواسير وتركيبات', 'عدم كفاية الضغط', 'إعادة الحساب الهيدروليكي مع الفواقد'),
  ('ERR-EXE-01', 'تنفيذ', 'اختراق جدار مقاوم دون إغلاق معتمد', 'فتحات غير محمية', 'مخالفة مقاومة الحريق', 'تفاصيل اختراق معتمدة وفحص'),
  ('ERR-RPT-01', 'تقارير', 'تقرير بدون مراجع', 'توصيات بلا ربط بكود/لائحة', 'ضعف التوثيق', 'إدراج مرجع EKB/SBC لكل توصية'),
  ('ERR-DOC-01', 'وثائق', 'نسخ نماذج قديمة', 'استخدام نموذج ملغى', 'عدم مطابقة الإصدار', 'التحقق من مكتبة التحديثات والنماذج')
ON CONFLICT (error_code) DO NOTHING;

INSERT INTO public.ekb_scenarios (scenario_code, name_ar, facility_type, summary, typical_systems, key_risks, decision_notes) VALUES
  ('SCN-SCHOOL', 'مدرسة', 'تعليمي', 'إشغال عالي الكثافة وممرات إخلاء', ARRAY['إنذار','طفايات','إضاءة طوارئ'], ARRAY['ازدحام','تأخير إخلاء'], 'التركيز على المخارج والتدريب'),
  ('SCN-HOSP', 'مستشفى', 'صحي', 'مرضى غير قادرين على الإخلاء الذاتي', ARRAY['إنذار','رش/مناسب','مقصورات'], ARRAY['إخلاء أفقي','معدات طبية'], 'defend-in-place حيث ينطبق'),
  ('SCN-HOTEL', 'فندق', 'فندقي', 'إشغال ليلي وغرف متعددة', ARRAY['إنذار','رشاشات','مخارج'], ARRAY['دخان بالممرات'], 'إنذار للغرف والممرات'),
  ('SCN-CHEM-WH', 'مستودع كيماويات', 'تخزين خطر', 'مواد متعددة التوافق', ARRAY['كشف','إطفاء حسب المادة'], ARRAY['عدم توافق كيميائي'], 'فصل التخزين ومراجعة SDS'),
  ('SCN-FUEL', 'محطة وقود', 'وقود', 'سوائل قابلة للاشتعال في العراء/خزانات', ARRAY['رغوة/مناسب','طفايات'], ARRAY['انسكاب','اشتعال بخار'], 'مسافات فصل وتهوية'),
  ('SCN-DC', 'مركز بيانات', 'تقنية', 'حماية معدات وسلامة أشخاص', ARRAY['إنذار مبكر','غاز نظيف'], ARRAY['ماء على معدات','توقف خدمة'], 'إحكام الغرفة وحساب التركيز')
ON CONFLICT (scenario_code) DO NOTHING;

INSERT INTO public.ekb_risks (risk_code, name_ar, project_types, likelihood, severity, prevention, corrective_actions) VALUES
  ('RSK-EGRESS', 'تعثر الإخلاء', ARRAY['تعليمي','فندقي','تجاري'], 'متوسط', 'عالٍ', 'مخارج كافية ولافتات وتدريب', 'إعادة تقييم حمل الإشغال والمسارات'),
  ('RSK-HAZMAT', 'حادث مواد خطرة', ARRAY['صناعي','مستودع','وقود'], 'متوسط', 'عالٍ جداً', 'تخزين متوافق وSDS', 'احتواء وتنظيف وخطة طوارئ'),
  ('RSK-FALSE', 'إنذارات كاذبة متكررة', ARRAY['تجاري','فندقي'], 'عالٍ', 'متوسط', 'اختيار كاشف مناسب وصيانة', 'إعادة تموضع/استبدال أجهزة'),
  ('RSK-WATER', 'ضرر ماء على أصول حساسة', ARRAY['مركز بيانات','كهرباء'], 'متوسط', 'عالٍ', 'غاز نظيف/تصميم مخصص', 'عزل كهربائي وتجفيف')
ON CONFLICT (risk_code) DO NOTHING;

INSERT INTO public.ekb_updates (update_code, update_type, title, summary, effective_date, system_impact, source_ref) VALUES
  ('UPD-EKB-1.0', 'إصدار معرفة', 'إطلاق EKB v1.0', 'اعتماد مكتبات المعرفة الهندسية للمرحلة الأولى', CURRENT_DATE, 'إضافة كتالوج EKB وربطه بـ DDS', 'docs/ekb/EKB-v1.0.md')
ON CONFLICT (update_code) DO NOTHING;

-- مرآة مختصرة في knowledge_articles للاستخدام عبر التطبيق/الذكاء الاصطناعي
INSERT INTO public.knowledge_articles (article_code, title, category, question, explanation, tags, version_no, is_active)
SELECT seed.article_code, seed.title, seed.category, seed.question, seed.explanation, seed.tags, 1, true
FROM (VALUES
  ('EKB-ACT-OVERVIEW', 'نظرة على مكتبة الأنشطة', 'activities', 'كيف تُختار الأنظمة حسب النشاط؟', 'استخدم ekb_activities لتحديد الأنظمة الإلزامية والاختيارية والمحظورة لكل نشاط قبل التصميم.', ARRAY['ekb','activities']),
  ('EKB-FAQ-SPRINKLER', 'إلزام الرشاشات', 'faq', 'متى يُلزم الرش الآلي؟', 'يُحدد وفق SBC والجهة المختصة ونوع الإشغال والمساحة؛ راجع EKB FAQ-01 ومكتبة الأنشطة.', ARRAY['ekb','faq','sprinkler']),
  ('EKB-SCN-DC', 'سيناريو مركز بيانات', 'scenarios', 'كيف نتعامل مع مركز بيانات؟', 'إنذار مبكر + غاز نظيف مناسب مع إحكام الغرفة؛ تجنب الماء على المعدات الحية دون تصميم مخصص.', ARRAY['ekb','scenarios','datacenter'])
) AS seed(article_code, title, category, question, explanation, tags)
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_articles k WHERE k.article_code = seed.article_code
);

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ekb_code_references','ekb_activities','ekb_hazardous_materials','ekb_systems_catalog',
    'ekb_faq','ekb_common_errors','ekb_scenarios','ekb_risks','ekb_updates'
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
