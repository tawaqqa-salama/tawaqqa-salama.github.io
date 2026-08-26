import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildUnderConstructionTechnicalReportModel } from '../lib/projects/under-construction-technical-report-model';
import { buildUnderConstructionFinalTechnicalReportHtml } from '../lib/projects/under-construction-final-report-template';
import type { ClientRecord } from '../lib/types/client';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT } from '../lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '../lib/types/fire-protection-design';
import type { CompanyProfile } from '../lib/company-profile';

const outDir = '/tmp/under-construction-final-technical-report-pdf';
mkdirSync(outDir, { recursive: true });

const client = {
  id: 'uc-final-fixture',
  client_code: 'UC-FINAL-01',
  name: 'مشروع اختبار مبنى إداري تحت الإنشاء',
  business_name: 'مشروع اختبار مبنى إداري تحت الإنشاء',
  owner_name: 'مالك اختبار التقرير',
  region: 'منطقة الرياض', city: 'الرياض', district: 'العليا', street: 'طريق الاختبار',
  building_area: 5200, land_area: 3100, floors_count: 4,
  activity_type: 'office', project_status: 'قيد الإنشاء',
  primary_engineering_project_identity: {
    clientId: 'uc-final-fixture', projectId: 'uc-final-fixture', projectCode: 'PRJ-2026-UC-0001', projectClassification: 'UNDER_CONSTRUCTION',
  },
} as ClientRecord;

const company = {
  name: 'توقع سلامة', legal_name: 'توقع سلامة للاستشارات الهندسية',
} as CompanyProfile;

const report = {
  ...EMPTY_TECHNICAL_REPORT,
  outgoing_number: 'TR-UC-FINAL-01', report_date: '2026-08-26',
  building_permit_number: 'BP-UC-2026-01',
} as typeof EMPTY_TECHNICAL_REPORT;

const engineeringData = {
  ...EMPTY_PROJECT_ENGINEERING_DATA,
  technical_report: report,
  building_plan: {
    ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
    report_date: '2026-08-20', building_use: 'مكاتب إدارية ومناطق خدمات',
    occupancy_classification: 'مكاتب إدارية', floors_description: 'أربعة أدوار تشغيلية مع دور خدمات',
    building_permit_number: 'BP-UC-2026-01', building_permit_date: '2026-02-15',
  },
  fire_protection_design: {
    ...EMPTY_FIRE_PROTECTION_DESIGN,
    applicable_codes: ['SBC 801', 'NFPA 13', 'NFPA 72'],
    occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, occupancy_type: 'مكاتب إدارية', hazard_class: 'ordinary_hazard_group_1', floors_count: '4', area_m2: '5200', source: 'engineer_input' },
    sprinkler: { ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler, required: 'yes', system_type: 'wet', k_factor: 'K80', design_pressure: '14 bar', design_flow: '1403 GPM' },
    pump: { ...EMPTY_FIRE_PROTECTION_DESIGN.pump, rated_flow: { value: 1403, unit: 'GPM', input_unit: 'GPM', source: 'hydraulic_calc' }, rated_pressure: { value: 14, unit: 'bar', input_unit: 'bar', source: 'hydraulic_calc' } },
    water_tank: { ...EMPTY_FIRE_PROTECTION_DESIGN.water_tank, exists: 'yes', capacity_m3: { value: 120, unit: 'm³', input_unit: 'm³', source: 'engineer_input' } },
  },
  under_construction_study: {
    version: 1,
    project_description: 'دراسة متطلبات السلامة للمشروع قبل التنفيذ، مع ربط الأنظمة بالمخططات والحسابات المعتمدة.',
    code_references: [{ id: 'sbc', title: 'الكود السعودي للحريق', reference: 'SBC 801', note: 'يُراجع الإصدار المعتمد للمشروع.' }],
    general_implementation_notes: 'ينفذ المقاول الأعمال وفق المخططات المعتمدة وتحت إشراف المهندس المختص.',
    systems: {
      fire_truck_access: { applicable: true, code_requirement: 'مسار وصول واضح لآليات الدفاع المدني', selected_solution: 'مسار خارجي بعرض مناسب حسب المخطط', drawing_reference: 'FP-101', implementation_note: 'إبقاء المسار خاليًا أثناء التنفيذ.' },
      fire_water_source: { applicable: true, code_requirement: 'مصدر مياه حريق موثوق', selected_solution: 'شبكة وخزان مياه حريق', drawing_reference: 'FP-201' },
      electric_fire_pump: { applicable: true, code_requirement: 'مضخة حريق كهربائية حسب الطلب التصميمي', selected_solution: 'مضخة رئيسية كهربائية', calculation_reference: 'HYD-01' },
      sprinkler_system: { applicable: true, code_requirement: 'نظام رش آلي يغطي المناطق المشمولة', selected_solution: 'نظام رش رطب (Wet Pipe)', code_reference: 'NFPA 13', drawing_reference: 'FP-301', calculation_reference: 'HYD-01', implementation_note: 'اختبار الضغط قبل إغلاق الأسقف.' },
      fire_alarm_system: { applicable: true, code_requirement: 'نظام إنذار ومراقبة مركزي', selected_solution: 'لوحة إنذار عنوانية', drawing_reference: 'FA-401' },
      panel_locations: { applicable: true, selected_solution: 'لوحة رئيسية قرب المدخل ومكررات حسب المخطط', drawing_reference: 'FA-402' },
      emergency_lighting: { applicable: true, selected_solution: 'وحدات إنارة طوارئ مستقلة عند المخارج ومسارات الهروب' },
      exit_signs: { applicable: true, selected_solution: 'لوحات مخارج مضاءة ومرئية' },
      mechanical_ventilation: { applicable: true, selected_solution: 'تهوية ميكانيكية حسب مخططات الخدمات' },
      emergency_power: { applicable: true, selected_solution: 'مصدر قدرة احتياطية للأنظمة ذات الصلة' },
      voice_evacuation: { applicable: false },
    },
  },
} as typeof EMPTY_PROJECT_ENGINEERING_DATA;

function renderPdf(htmlPath: string, pdfPath: string) {
  const result = spawnSync('chromium', ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files', `--print-to-pdf=${pdfPath}`, '--no-pdf-header-footer', pathToFileURL(htmlPath).href], { encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'تعذر إنشاء PDF');
}

function pdfPages(pdfPath: string): string[] {
  const result = spawnSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr || 'تعذر استخراج PDF');
  return result.stdout.split(String.fromCharCode(12)).map((page) => page.trim()).filter(Boolean);
}

function detectPageMap(pages: string[]): Record<string, number> {
  const ids = ['intro', 'project', 'building', 'basis', 'requirements', 'engineering', 'data', 'recommendations', 'summary', 'approvals'];
  const map: Record<string, number> = {};
  for (const id of ids) {
    const marker = `SECTION_PAGE_${id}MARKEREND`;
    const index = pages.findIndex((page, pageIndex) => pageIndex > 1 && page.includes(marker));
    if (index < 0) throw new Error(`تعذر اكتشاف صفحة ${id}`);
    map[id] = index + 1;
  }
  return map;
}

const model = buildUnderConstructionTechnicalReportModel(client, engineeringData, company);
const pass1Html = buildUnderConstructionFinalTechnicalReportHtml({ model, company });
const pass1HtmlPath = `${outDir}/under-construction-pass1.html`;
const pass1PdfPath = `${outDir}/under-construction-pass1.pdf`;
writeFileSync(pass1HtmlPath, pass1Html, 'utf8');
renderPdf(pass1HtmlPath, pass1PdfPath);
const pageMap = detectPageMap(pdfPages(pass1PdfPath));
const html = buildUnderConstructionFinalTechnicalReportHtml({ model, company, pageMap });
const htmlPath = `${outDir}/under-construction-final.html`;
const pdfPath = `${outDir}/under-construction-final.pdf`;
writeFileSync(htmlPath, html, 'utf8');
renderPdf(htmlPath, pdfPath);
const finalPages = pdfPages(pdfPath);
const text = finalPages.join('\f');
const pageCount = finalPages.length;
const checks = {
  real_pdf: readFileSync(pdfPath).subarray(0, 5).toString() === '%PDF-',
  title: html.includes('التقرير الفني للمبنى تحت الإنشاء') && text.includes('UNDER_CONSTRUCTION'),
  approval: html.includes('الاعتماد والتوقيعات') && pageMap.approvals > 0,
  toc_verified: Object.values(pageMap).every((page) => Number.isInteger(page) && page > 0) && !text.includes('SECTION_PAGE_'),
  no_raw_enums: !text.includes('ordinary_hazard_group_1') && !text.includes('K-Factor K80'),
  k_factor: text.includes('K = 80') || text.includes('K-Factor = 80'),
  no_diagnostics: !/NEEDS_DATA|RULE_NOT_CONFIGURED|BLOCKED/.test(text),
  no_fixture_identity: !text.includes('uc-final-fixture'),
  no_browser_chrome: !text.includes('file:///') && !text.includes('about:blank'),
};
for (const [key, value] of Object.entries(checks)) if (!value) throw new Error(`فشل تحقق ${key}`);
writeFileSync(`${outDir}/result.json`, JSON.stringify({ pageCount, pageMap, checks, pdfPath }, null, 2));
console.log(JSON.stringify({ pageCount, pageMap, checks, pdfPath, htmlPath }));
