import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import type { CompanyProfile } from '../lib/company-profile';
import { buildOfficialTechnicalReportHtml } from '../lib/projects/engineering-report-engine/renderer/official-technical-template';
import { generateOfficialTechnicalReportDocument } from '../lib/projects/official-technical-report-document';
import type { ClientRecord } from '../lib/types/client';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT } from '../lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '../lib/types/fire-protection-design';
import { emptySafetyQuantities } from '../lib/projects/design-center/space-safety';

const outDir = '/tmp/official-technical-report-pdf';
mkdirSync(outDir, { recursive: true });

const client: ClientRecord = {
  id: 'official-report-fixture',
  client_code: 'OFFICIAL-FIX-01',
  name: 'منشأة اختبار التقرير الرسمي',
  business_name: 'منشأة اختبار التقرير الرسمي',
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
  stamp_text: 'ختم اختبار',
} as CompanyProfile;

const report = {
  ...EMPTY_TECHNICAL_REPORT,
  outgoing_number: 'TR-OFFICIAL-FIX-01',
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
  const document = generateOfficialTechnicalReportDocument({
    client,
    report: report as never,
    engineeringData: {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: report as never,
      design_center: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
        space_safety: {
          source: 'project_engineering',
          floors: [
            {
              id: 'ground',
              label: 'الدور الأرضي',
              repeat_count: 1,
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
                    signs: 6,
                  },
                },
              ],
            },
          ],
        },
      },
      fire_protection_design: fireDesign,
    },
  });
  const html = buildOfficialTechnicalReportHtml({ document, company });
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
  const result = {
    htmlPath,
    pdfPath,
    pageCount: pdf.numPages,
    blankPages: pages.flatMap((page, index) => page ? [] : [index + 1]),
    internalTerms: ['إدخال المهندس', 'محسوب من المدخلات', 'Preliminary Engineering Check', 'لم يتم إدخال القيمة', 'حالة التقرير:', 'workflow'].filter((term) => pages.join('\n').includes(term)),
    pages,
  };
  writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
