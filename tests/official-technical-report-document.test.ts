import { describe, expect, it } from 'vitest';
import type { ClientRecord } from '@/lib/types/client';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT } from '@/lib/types/project-reports';
import { buildOfficialTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/official-technical-template';
import { generateOfficialTechnicalReportDocument } from '@/lib/projects/official-technical-report-document';

const client: ClientRecord = {
  id: 'official-pdf-client',
  client_code: 'OFFICIAL-1',
  name: 'منشأة الاختبار الرسمية',
  business_name: 'منشأة الاختبار الرسمية',
  owner_name: 'المالك',
  city: 'الرياض',
  building_area: 100,
  floors_count: 1,
};

function reportFixture() {
  return {
    ...EMPTY_TECHNICAL_REPORT,
    outgoing_number: 'TR-OFFICIAL-001',
    report_date: '2026-08-23',
    floor_uses: [
      {
        id: 'floor-1',
        floor_name: 'الأرضي',
        floor_area_m2: '100',
        structure: '',
        classification: 'B',
        zones: [
          {
            id: 'zone-1',
            label: 'مكاتب',
            use_code: 'مكاتب',
            area_m2: '100',
            occupancy_code: 'B',
          },
        ],
      },
    ],
    recommendations_v2: {
      version: 1,
      items: [
        {
          id: 'approved',
          library_item_id: 'approved',
          library_version: 'v1',
          status: 'approved',
          effective_text_ar: 'توصية معتمدة للعرض في التقرير.',
          manual_override: false,
          sort_order: 1,
          fingerprint: 'approved-fingerprint',
          affected_scopes: [],
          evidence_ids: [],
          code_evidence_ids: [],
          source: 'approved_reference_report',
          approved_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'rejected',
          library_item_id: 'rejected',
          library_version: 'v1',
          status: 'rejected',
          effective_text_ar: 'توصية مرفوضة لا يجب طباعتها.',
          manual_override: false,
          sort_order: 2,
          fingerprint: 'rejected-fingerprint',
          affected_scopes: [],
          evidence_ids: [],
          code_evidence_ids: [],
          source: 'approved_reference_report',
        },
      ],
    },
  } as typeof EMPTY_TECHNICAL_REPORT;
}

function engineeringData() {
  const report = reportFixture();
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: report,
    fire_protection_design: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.fire_protection_design,
      water_supply: { water_source: 'خزان أرضي', tank_type: 'أرضي', tank_material: 'خرسانة' },
      pump: {
        exists: 'yes',
        type: 'UL',
        capacity: { value: 350, unit: 'GPM', input_unit: 'GPM', source: 'engineer_input' },
        pressure: { value: 8, unit: 'bar', input_unit: 'bar', source: 'engineer_input' },
        rated_flow: { value: 350, unit: 'GPM', input_unit: 'GPM', source: 'engineer_input' },
        rated_pressure: { value: 8, unit: 'bar', input_unit: 'bar', source: 'engineer_input' },
        source: 'engineer_input',
      },
      diesel_pump: {
        exists: 'yes',
        capacity: { value: 350, unit: 'GPM', input_unit: 'GPM', source: 'hydraulic_calc' },
        pressure: { value: 8, unit: 'bar', input_unit: 'bar', source: 'hydraulic_calc' },
        source: 'hydraulic_calc',
      },
      jockey_pump: {
        exists: 'yes',
        capacity: { value: 20, unit: 'GPM', input_unit: 'GPM', source: 'engineer_input' },
        pressure: { value: 9, unit: 'bar', input_unit: 'bar', source: 'engineer_input' },
        source: 'engineer_input',
      },
      water_tank: {
        exists: 'yes',
        capacity_m3: { value: 100, unit: 'm³', input_unit: 'm³', source: 'engineer_input' },
        water_demand_lpm: { value: 1324.89, unit: 'L/min', input_unit: 'L/min', source: 'calculated' },
        duration_min: { value: 60, unit: 'min', input_unit: 'min', source: 'rule_requirement' },
        calculated_required_volume_m3: 79.493,
        formula_ar: 'V (م³) = Q × T ÷ 1000',
        source: 'engineer_input',
      },
    },
  } as typeof EMPTY_PROJECT_ENGINEERING_DATA;
}

function allDocumentText(document: ReturnType<typeof generateOfficialTechnicalReportDocument>) {
  return document.sections
    .flatMap((section) => [
      section.title_ar,
      ...section.paragraphs.map((paragraph) => paragraph.text),
      ...(section.tables || []).flatMap((table) => [table.caption_ar, ...table.rows.flat()]),
    ])
    .join('\n');
}

describe('official technical report PDF document', () => {
  it('uses the existing canonical hydraulic values as formal report rows without source or validation labels', () => {
    const report = reportFixture();
    const data = engineeringData();
    const document = generateOfficialTechnicalReportDocument({ client, report, engineeringData: data });
    const content = allDocumentText(document);

    expect(content).toContain('350 GPM');
    expect(content).toContain('8 bar');
    expect(content).toContain('100 m³');
    expect(content).toContain('1324.89 L/min');
    expect(content).toContain('60 min');
    expect(content).toContain('79.493 م³');
    expect(content).toContain('مضخات الحريق');
    expect(content).toContain('إمداد مياه الإطفاء');
    expect(content).not.toContain('إدخال المهندس');
    expect(content).not.toContain('محسوب من المدخلات');
    expect(content).not.toContain('متطلب كودي / قاعدة');
    expect(content).not.toContain('Preliminary Engineering Check');
    expect(content).not.toContain('لم يتم إدخال القيمة');
  });

  it('uses a formal report structure, only final recommendations, and unique section identifiers', () => {
    const report = reportFixture();
    const document = generateOfficialTechnicalReportDocument({ client, report, engineeringData: engineeringData() });
    const titles = document.sections.map((section) => section.title_ar);
    const content = allDocumentText(document);

    expect(titles).toEqual(expect.arrayContaining([
      'المقدمة',
      'نطاق الدراسة والأكواد والمراجع',
      'وصف المشروع',
      'تصنيف الإشغال ونوع البناء',
      'مقاومة عناصر المبنى',
      'حماية الجدران الخارجية',
      'وسائل الخروج',
      'متطلبات المبنى وفق الكود',
      'تقسيمات ومقصورات الحريق',
      'أنظمة السلامة الميكانيكية ومكافحة الحريق',
      'الخلاصة الفنية',
    ]));
    expect(new Set(document.sections.map((section) => section.id)).size).toBe(document.sections.length);
    expect(content).toContain('توصية معتمدة للعرض في التقرير.');
    expect(content).not.toContain('توصية مرفوضة لا يجب طباعتها.');
    expect(content).not.toContain('حالة التقرير:');
    expect(content).not.toContain('لا تُحوّل القيم غير المدخلة إلى صفر');
    expect(content).not.toContain('بيانات الوصول والجهات ذات الصلة');
  });

  it('renders a static A4 official layout with report identity, running header, and page X of Y footer', () => {
    const report = reportFixture();
    const document = generateOfficialTechnicalReportDocument({ client, report, engineeringData: engineeringData() });
    const html = buildOfficialTechnicalReportHtml({ document, company: DEFAULT_COMPANY_PROFILE });

    expect(html).toContain('@page { size:A4 portrait');
    expect(html).toContain('official-running-header');
    expect(html).toContain('TR-OFFICIAL-001');
    expect(html).toContain('صفحة');
    expect(html).toContain('من');
    expect(html).not.toContain('GitHub Pages URL');
    expect(html).not.toContain('browser URL');
  });
});
