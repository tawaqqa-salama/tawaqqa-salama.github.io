import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import type { CompanyProfile } from '../lib/company-profile';
import { buildExistingFinalTechnicalReportHtml } from '../lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import { buildExistingTechnicalReportModel } from '../lib/projects/existing-technical-report-model';
import { buildExistingFinalTechnicalReportDocument } from '../lib/projects/existing-final-technical-report-document';
import type { ClientRecord } from '../lib/types/client';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT } from '../lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '../lib/types/fire-protection-design';
import { emptySafetyQuantities } from '../lib/projects/design-center/space-safety';

const outDir = '/tmp/existing-final-technical-report-pdf';
mkdirSync(outDir, { recursive: true });

const client: ClientRecord = {
    id: 'existing-final-report-fixture',
    primary_engineering_project_identity: { clientId: 'existing-final-report-fixture', projectId: 'existing-final-report-fixture', projectCode: 'PRJ-2026-EXISTING', projectClassification: 'EXISTING' },
  client_code: 'EX-FINAL-01',
  name: 'منشأة الموقع القائم — التقرير الرسمي',
  business_name: 'منشأة الموقع القائم — التقرير الرسمي',
  owner_name: 'مالك المنشأة',
  city: 'الرياض',
  district: 'العليا',
  street: 'طريق الملك فهد',
  building_area: 850,
  floors_count: 2,
};

const company = {
  name: 'توقع سلامة',
  legal_name: 'توقع سلامة للاستشارات',
  tagline: 'للاستشارات الهندسية والسلامة والوقاية من الحريق',
  stamp_text: 'ختم المكتب',
} as CompanyProfile;

const report = {
  ...EMPTY_TECHNICAL_REPORT,
  outgoing_number: 'TR-EX-FINAL-01',
  report_date: '2026-08-23',
  floor_uses: [
    {
      id: 'ground',
      floor_name: 'الدور الأرضي',
      floor_area_m2: '450',
      structure: 'خرسانة مسلحة',
      classification: 'B',
      zones: [
        { id: 'ground-office', label: 'مكاتب إدارية', use_code: 'مكاتب إدارية', area_m2: '300', occupancy_code: 'B' },
        { id: 'ground-store', label: 'مستودع محدود', use_code: 'تخزين', area_m2: '150', occupancy_code: 'S' },
      ],
    },
    {
      id: 'first',
      floor_name: 'الدور الأول',
      floor_area_m2: '400',
      structure: 'خرسانة مسلحة',
      classification: 'B',
      zones: [
        { id: 'first-office', label: 'مكاتب إدارية', use_code: 'مكاتب إدارية', area_m2: '400', occupancy_code: 'B' },
      ],
    },
  ],
  recommendations_v2: {
    version: 1 as const,
    items: [
      {
        id: 'approved-fixture',
        library_item_id: 'approved-fixture',
        library_version: 'fixture',
        status: 'approved' as const,
        effective_text_ar: 'توصية هندسية معتمدة للاختبار البصري للقالب الرسمي.',
        manual_override: false,
        sort_order: 1,
        fingerprint: 'approved-fixture',
        affected_scopes: [],
        evidence_ids: [],
        code_evidence_ids: [],
        source: 'office_template' as const,
        approved_at: '2026-08-23T00:00:00.000Z',
      },
    ],
  },
};

const fireDesign = {
  ...EMPTY_FIRE_PROTECTION_DESIGN,
  occupancy: {
    ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy,
    occupancy_type: 'إداري وتخزين محدود',
    hazard_class: 'خطر عادي — المجموعة الأولى',
    floors_count: '2',
    area_m2: '850',
  },
  water_supply: { water_source: 'شبكة المياه وخزان أرضي', tank_type: 'أرضي', tank_material: 'خرسانة' },
  pump: {
    exists: 'yes' as const,
    type: 'UL' as const,
    capacity: { value: 350, unit: 'GPM' as const, input_unit: 'GPM' as const, source: 'engineer_input' as const },
    pressure: { value: 8, unit: 'bar' as const, input_unit: 'bar' as const, source: 'engineer_input' as const },
    rated_flow: { value: 350, unit: 'GPM' as const, input_unit: 'GPM' as const, source: 'engineer_input' as const },
    rated_pressure: { value: 8, unit: 'bar' as const, input_unit: 'bar' as const, source: 'engineer_input' as const },
    source: 'engineer_input' as const,
  },
  diesel_pump: {
    exists: 'yes' as const,
    capacity: { value: 350, unit: 'GPM' as const, input_unit: 'GPM' as const, source: 'hydraulic_calc' as const },
    pressure: { value: 8, unit: 'bar' as const, input_unit: 'bar' as const, source: 'hydraulic_calc' as const },
    source: 'hydraulic_calc' as const,
  },
  jockey_pump: {
    exists: 'yes' as const,
    capacity: { value: 20, unit: 'GPM' as const, input_unit: 'GPM' as const, source: 'engineer_input' as const },
    pressure: { value: 9, unit: 'bar' as const, input_unit: 'bar' as const, source: 'engineer_input' as const },
    source: 'engineer_input' as const,
  },
  water_tank: {
    exists: 'yes' as const,
    capacity_m3: { value: 100, unit: 'm³' as const, input_unit: 'm³' as const, source: 'engineer_input' as const },
    water_demand_lpm: { value: 1324.89, unit: 'L/min' as const, input_unit: 'L/min' as const, source: 'calculated' as const },
    duration_min: { value: 60, unit: 'min' as const, input_unit: 'min' as const, source: 'rule_requirement' as const },
    calculated_required_volume_m3: 79.493,
    formula_ar: 'V (م³) = Q (لتر/دقيقة) × T (دقيقة) ÷ 1000',
    source: 'engineer_input' as const,
  },
  sprinkler: {
    ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
    required: 'yes' as const,
    system_type: 'رش آلي مائي',
    zones_count: '2',
    sprinkler_type: 'استجابة سريعة',
    k_factor: 'K80',
    design_pressure: '1.5 bar',
    design_flow: '1324.89 L/min',
  },
  standpipe: { required: 'yes' as const, notes: 'نظام Standpipe داخلي حسب التصميم.', source: 'engineer_input' as const },
  extinguishers: [
    { id: 'ext-1', type: 'بودرة جافة ABC', count: '8', location: 'الممرات ومناطق العمل', rating: '6 كجم' },
  ],
  fire_alarm: {
    control_panel: 'لوحة إنذار عنوانية',
    smoke_detectors: 'كواشف دخان موزعة حسب المخطط',
    heat_detectors: 'كواشف حرارة عند مناطق الخدمات',
    manual_call_points: 'نقاط نداء يدوي عند المخارج',
    bells: 'أجهزة إنذار صوتية ومرئية',
    voice_alarm: '',
    integration: 'مرتبطة بأنظمة الإطفاء ذات الصلة',
    notes: '',
    source: 'engineer_input' as const,
  },
  supporting_systems: {
    emergency_lighting: { status: 'required' as const },
    exit_signs: { status: 'required' as const },
    smoke_control: { status: 'by_design' as const },
    ventilation: { status: 'by_design' as const },
    electrical_safety: { status: 'required' as const },
    emergency_power: { status: 'by_design' as const },
  },
  summary_text: 'تُعرض أنظمة السلامة والوقاية من الحريق وفق البيانات الفنية المتاحة والمخططات والمستندات المرتبطة بالمشروع.',
};

async function main() {
  const engineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: report as never,
      building_plan: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
        building_use: 'مبنى إداري قائم متعدد الاستخدامات',
        occupancy_classification: 'مكاتب إدارية وتخزين محدود',
        floors_description: 'دوران تشغيليان مع تكرار مساحة المكاتب في الدور النموذجي',
        building_permit_number: 'BP-EX-2026-01',
        building_permit_date: '2024-03-15',
        exits_count: '4',
        stairs_count: '2',
      },
      existing_assessment: {
        version: 1,
        systems: {
          fire_truck_access: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'مدخل سيارات الإطفاء واضح من الجهة الشمالية، مع ملاحظة الحاجة إلى إبقاء المسار خاليًا.', required_text: 'يجب الحفاظ على مسار وصول مناسب لآليات الدفاع المدني.', gap_text: 'توجد حاجة إلى تثبيت علامة منع الوقوف عند المدخل.', compliance_status: 'NEEDS_COMPLETION', action_text: 'تركيب العلامة وتوثيق المسار بالصور بعد التنفيذ.', requirement_reference: 'متطلبات الوصول — مرجع التقييم', evidence_ids: ['ev-access-01'], observation: 'ملاحظة وصول طويلة للتحقق من التفاف النص العربي دون قص: يجب إبقاء المسار خاليًا من المركبات والعوائق أثناء التشغيل اليومي.' },
          fdc: { applicable: true, existing_presence: 'UNKNOWN', required_text: 'وصلة دفاع مدني واضحة وميسرة للوصول ومطابقة للتصميم.', gap_text: 'لم تُوثق حالة الوصلة وموقعها النهائي.', compliance_status: 'NEEDS_COMPLETION', action_text: 'تحديد الموقع وتوثيقه ميدانيًا ومراجعته من المهندس.', requirement_reference: 'متطلبات وصلة الدفاع المدني (FDC)' },
          fire_water_source: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'مصدر مياه قائم مرتبط بالشبكة وخزان أرضي.', required_text: 'مصدر مياه حريق موثوق حسب التصميم المعتمد.', gap_text: 'لم يُستكمل فحص صمامات العزل.', compliance_status: 'NON_COMPLIANT', action_text: 'فحص الصمامات وتحديث سجل الصيانة.', requirement_reference: 'بيانات مصدر المياه ضمن التصميم الفني' },
          fire_tank: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'خزان مياه حريق أرضي بسعة مركبة 100 م³.', required_text: 'سعة خزان تلبي الطلب والزمن المطلوبين في التصميم.', gap_text: 'يلزم استكمال مطابقة السعة الفعلية مع سجل الاختبار.', compliance_status: 'NEEDS_COMPLETION', action_text: 'مراجعة شهادة الخزان وتسجيل نتيجة المطابقة.', requirement_reference: 'بيانات الخزان ضمن التصميم الفني' },
          fire_pumps: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'مجموعة مضخات مركبة في غرفة الخدمات.', compliance_status: 'COMPLIANT', observation: 'تمت مطابقة بيانات المجموعة مع السجل المتاح.', evidence_ids: ['ev-pump-01'] },
          standpipe: { applicable: true, existing_presence: 'UNKNOWN', observation: 'لم يكتمل التحقق من جميع نقاط المواسير الرأسية.', compliance_status: 'NEEDS_COMPLETION', gap_text: 'تحتاج نقاط الفحص إلى توثيق ميداني.', action_text: 'استكمال التحقق وتوثيق كل نقطة.', requirement_reference: 'بيانات المواسير الرأسية ضمن التصميم الفني' },
          special_suppression: { applicable: false, compliance_status: 'NOT_APPLICABLE', observation: 'لا توجد مناطق خاصة مسجلة ضمن نطاق التقييم الحالي.' },
          hose_reel_hydrant: { applicable: false, compliance_status: 'NOT_APPLICABLE', observation: 'غير منطبق حسب نطاق الموقع المسجل.' },
          sprinkler_system: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'شبكة رش آلي قائمة وتغطي مناطق المكاتب والتخزين المحدود.', observed_specs: [{ id: 'spr-spec-01', label: 'لوحة المنطقة', value: 'منطقة الرش رقم 1' }], required_text: 'نظام رش آلي مائي يغطي المناطق المشمولة بالتصميم.', gap_text: 'تحتاج منطقة التخزين إلى استكمال مراجعة التغطية.', compliance_status: 'NON_COMPLIANT', action_text: 'مراجعة التغطية وإغلاق الفجوة ثم اعتماد المعالجة من المهندس المختص.', requirement_reference: 'بيانات الرش ضمن التصميم الفني ومركز التصاميم', evidence_ids: ['ev-sprinkler-01'], observation: 'تمت ملاحظة شبكة قائمة، مع ضرورة استكمال التحقق من توزيع الرشاشات في المنطقة الخلفية.' },
          means_of_egress: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'مخارج ومسالك هروب واضحة في الدورين، مع مسار يحتاج إلى إزالة عائق مؤقت.', required_text: 'مسالك هروب ومخارج واضحة ومناسبة للأعداد المرصودة.', gap_text: 'العائق المؤقت يقلل وضوح المسار في الجزء الخلفي.', compliance_status: 'NON_COMPLIANT', action_text: 'إزالة العائق وإعادة التحقق من المسار.', requirement_reference: 'متطلبات وسائل ومخارج الهروب' },
          fire_extinguishers: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'طفايات بودرة جافة موزعة بالممرات.', compliance_status: 'COMPLIANT', observation: 'بطاقات الصيانة ظاهرة على العينات المفحوصة.' },
          mechanical_ventilation: { applicable: true, existing_presence: 'UNKNOWN', observation: 'لم تُسجل نتيجة فحص شاملة لمراوح التهوية.', compliance_status: 'NEEDS_COMPLETION', action_text: 'استكمال فحص التشغيل وتوثيق النتائج.' },
          smoke_control: { applicable: true, existing_presence: 'UNKNOWN', required_text: 'حل للتحكم بالدخان حسب طبيعة الإشغال والتصميم.', compliance_status: 'NEEDS_COMPLETION', gap_text: 'لم يكتمل التحقق من تشغيل نظام التحكم بالدخان.', action_text: 'استكمال فحص التشغيل وتوثيق النتيجة.', requirement_reference: 'متطلبات التحكم بالدخان' },
          fire_alarm_control_panel: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'لوحة إنذار عنوانية في غرفة الاستقبال.', compliance_status: 'COMPLIANT', observation: 'اللوحة ظاهرة وموقعها موثق.' },
          smoke_detectors: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'كواشف دخان موزعة في المساحات المشمولة.', compliance_status: 'COMPLIANT', evidence_ids: ['ev-alarm-01'] },
          heat_detectors: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'كواشف حرارة عند مناطق الخدمات.', compliance_status: 'COMPLIANT', observation: 'الكواشف ظاهرة في المناطق الموثقة.' },
          manual_call_points: { applicable: true, existing_presence: 'PRESENT', observed_configuration: 'نقاط نداء يدوي قرب المخارج الرئيسية.', required_text: 'نقاط نداء يدوية موزعة وفق مخطط الإنذار.', compliance_status: 'COMPLIANT', observation: 'مواقع النقاط موثقة ضمن مخطط الإنذار.' },
          alarm_notification_devices: { applicable: true, existing_presence: 'UNKNOWN', compliance_status: 'NEEDS_COMPLETION', gap_text: 'لم يكتمل اختبار التغطية الصوتية والمرئية.', action_text: 'استكمال اختبار أجهزة التنبيه وتسجيل النتيجة.', requirement_reference: 'بيانات أجهزة التنبيه ضمن التصميم الفني' },
          voice_evacuation: { applicable: false, compliance_status: 'NOT_APPLICABLE', observation: 'غير منطبق على نطاق الإشغال المسجل.' },
          emergency_lighting: { applicable: true, existing_presence: 'UNKNOWN', compliance_status: 'NEEDS_COMPLETION', gap_text: 'لم يكتمل اختبار زمن التشغيل.', action_text: 'تنفيذ اختبار البطاريات وتسجيل النتيجة.' },
          exit_signs: { applicable: true, existing_presence: 'PRESENT', compliance_status: 'COMPLIANT', observation: 'لوحات المخارج ظاهرة عند المسارات الرئيسية.' },
          electrical_safety: { applicable: true, existing_presence: 'UNKNOWN', required_text: 'منظومة كهربائية آمنة ومحمية من مصادر الاشتعال.', compliance_status: 'NEEDS_COMPLETION', gap_text: 'لم تستكمل مراجعة لوحات التوزيع والحماية.', action_text: 'استكمال الفحص الكهربائي وتوثيق الملاحظات.', requirement_reference: 'متطلبات السلامة الكهربائية' },
          grounding: { applicable: true, existing_presence: 'UNKNOWN', compliance_status: 'NEEDS_COMPLETION', action_text: 'إرفاق نتيجة اختبار التأريض المعتمد.', requirement_reference: 'السلامة الكهربائية — مرجع التقييم' },
          lightning_protection: { applicable: false, compliance_status: 'NOT_APPLICABLE', observation: 'غير منطبق ضمن نطاق المبنى المسجل.' },
          emergency_power: { applicable: true, existing_presence: 'ABSENT', compliance_status: 'NON_COMPLIANT', gap_text: 'لا توجد وسيلة قدرة احتياطية موثقة.', action_text: 'تقييم الحاجة وتركيب الحل المعتمد عند الانطباق.', requirement_reference: 'متطلبات القدرة الاحتياطية' },
        },
      },
      design_center: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
        space_safety: {
          source: 'project_engineering',
          floors: [
            {
              id: 'ground',
              label: 'الدور النموذجي',
              repeat_count: 2,
              areas: [
                {
                  id: 'ground-office',
                  label: 'مكاتب إدارية',
                  activity_type: 'office',
                  area_m2: 300,
                  hazard_suggested: 'ordinary_hazard_group_1',
                  suppression_suggested: ['رش آلي'],
                  quantities: {
                    ...emptySafetyQuantities(),
                    sprinklers: 18,
                    fire_alarm_panels: 1,
                    smoke_detectors: 14,
                    heat_detectors: 3,
                    alarm_bells: 4,
                    emergency_lights: 8,
                    emergency_exits: 4,
                    signs: 6,
                  },
                },
              ],
            },
          ],
        },
      },
      fire_protection_design: fireDesign,
    };
  const model = buildExistingTechnicalReportModel(client, engineeringData as never, company);
  const document = buildExistingFinalTechnicalReportDocument(model);
  const html = buildExistingFinalTechnicalReportHtml({ document, company });
  const htmlPath = join(outDir, 'official-technical-report.html');
  const pdfPath = join(outDir, 'official-technical-report.pdf');
  writeFileSync(htmlPath, html, 'utf8');
  const chrome = spawnSync('chromium', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
    `--print-to-pdf=${pdfPath}`, '--no-pdf-header-footer', '--print-to-pdf-no-header', pathToFileURL(htmlPath).href,
  ], { encoding: 'utf8', timeout: 120000 });
  if (chrome.status !== 0) throw new Error(chrome.stderr || chrome.stdout || 'تعذر إنشاء PDF الرسمي.');

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' ').trim());
  }
  const renderedText = pages.join('\n');
  const fixtureIdentityLeakage = renderedText.match(/(?:منشأة\s+اختبار|ختم\s+اختبار|OFFICIAL[-_ ]?FIX|FIXTURE|Demo|Mock|Test)/gi) || [];
  if (fixtureIdentityLeakage.length) {
    throw new Error(`Fixture identity leakage detected: ${fixtureIdentityLeakage.join(', ')}`);
  }
  const result = {
    htmlPath,
    pdfPath,
    pageCount: pdf.numPages,
    blankPages: pages.flatMap((page, index) => page ? [] : [index + 1]),
    assessmentSystemsRendered: model.assessment_sections.flatMap((section) => section.systems.map((system) => system.system_key)),
    assessmentSummary: model.summary,
    requiredAssessmentFields: ['البند', 'الوضع الراهن', 'المطلوب حسب الكود / التصميم', 'الفجوة', 'حالة المطابقة', 'الإجراء المطلوب', 'المرجع / الدليل'].filter((field) => JSON.stringify(document).includes(field)),
    internalTerms: ['إدخال المهندس', 'محسوب من المدخلات', 'Preliminary Engineering Check', 'لم يتم إدخال القيمة', 'حالة التقرير:', 'workflow', 'undefined', 'null', 'N/A', 'NEEDS_DATA', 'BLOCKED', 'RULE_NOT_CONFIGURED', 'fire_protection_design.', 'project_engineering_live.', 'design_center.'].filter((term) => renderedText.includes(term)),
    numericZeroPlaceholders: ['إجمالي المخارج:0', 'إجمالي الشاغلين:0', 'عدد المرشات:0'].filter((term) => renderedText.includes(term)),
    fixtureIdentityLeakage,
    pages,
  };
  writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
