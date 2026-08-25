import { readFileSync } from 'node:fs';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { buildExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import { buildExistingFinalTechnicalReportDocument } from '@/lib/projects/existing-final-technical-report-document';
import { buildExistingFinalTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const client: ClientRecord = {
  id: 'existing-final-test',
  client_code: 'EX-FINAL-01',
  name: 'موقع قائم للاختبار',
  business_name: 'منشأة اختبار القالب النهائي',
  owner_name: 'مالك الاختبار',
  city: 'الرياض',
  district: 'العليا',
  street: 'شارع الاختبار',
  building_area: 850,
  floors_count: 2,
  primary_engineering_project_identity: {
    clientId: 'existing-final-test',
    projectId: 'project-existing-final-test',
    projectCode: 'PRJ-2026-000001',
    projectClassification: 'EXISTING',
  },
};

function fixture() {
  return parseProjectEngineeringData({
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'TR-EX-FINAL-01',
      report_date: '2026-08-25',
      risk_class: 'خطر عادي — المجموعة الأولى',
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      building_use: 'مبنى إداري قائم',
      occupancy_classification: 'مكاتب إدارية',
      floors_description: 'دوران تشغيليان',
      building_permit_number: 'BP-EX-01',
      building_permit_date: '2024-01-15',
      exits_count: '4',
    },
    design_center: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
      space_safety: {
        source: 'project_engineering',
        floors: [{
          id: 'floor-1',
          label: 'الدور الأرضي',
          repeat_count: 1,
          areas: [{
            id: 'area-1',
            label: 'مكاتب إدارية',
            area_m2: 850,
            hazard_suggested: 'ordinary_hazard_group_1',
            suppression_suggested: ['رش آلي'],
            quantities: {
              sprinklers: 24,
              smoke_detectors: 12,
              heat_detectors: 2,
              fire_alarm_panels: 1,
              alarm_panel_locations: ['المدخل الرئيسي'],
              signs: 4,
              emergency_lights: 6,
              emergency_exits: 4,
              alarm_bells: 3,
              emergency_stairs: 2,
              manual_extinguishers: 8,
              elevators: 0,
              public_facilities: 0,
            },
          }],
        }],
      },
    },
    fire_protection_design: {
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
        rated_flow: { value: 1403, unit: 'GPM', source: 'hydraulic_calc' },
        rated_pressure: { value: 14, unit: 'bar', source: 'hydraulic_calc' },
      },
      water_tank: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.water_tank,
        capacity_m3: { value: 100, unit: 'm³', source: 'engineer_input' },
      },
      sprinkler: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
        system_type: 'Wet Pipe',
        sprinkler_type: 'Upright',
      },
      fire_alarm: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.fire_alarm,
        control_panel: 'FACP Addressable',
      },
    },
    existing_assessment: {
      version: 1,
      systems: {
        sprinkler_system: {
          existing_presence: 'PRESENT',
          observed_configuration: 'شبكة رش قائمة',
          required_text: 'نظام رش آلي مطلوب',
          gap_text: 'لم يكتمل التحقق من التغطية',
          compliance_status: 'NON_COMPLIANT',
          action_text: 'استكمال التحقق واعتماد المعالجة',
          requirement_reference: 'SBC 801',
        },
      },
    },
  });
}

describe('PR 7 — EXISTING final A4 technical report document', () => {
  it('builds the final document from ExistingTechnicalReportModel and preserves canonical display values', () => {
    const data = fixture();
    const model = buildExistingTechnicalReportModel(client, data, { name: 'توقع سلامة', legal_name: 'توقع سلامة للاستشارات' });
    const document = buildExistingFinalTechnicalReportDocument(model);
    const content = JSON.stringify(document);

    expect(document.title_ar).toContain('الموقع القائم');
    expect(model.engineering_sections.flatMap((item) => item.rows).map((row) => `${row.label}:${row.value}`).join('|')).toContain('تدفق المضخة المقنن:1403 GPM');
    expect(content).toContain('الوضع الراهن');
    expect(content).toContain('المطلوب حسب الكود / التصميم');
    expect(content).toContain('الفجوة');
    expect(content).toContain('حالة المطابقة');
    expect(content).toContain('الإجراء المطلوب');
    expect(content).toContain('بيانات الرش ضمن التصميم الفني ومركز التصاميم');
    expect(content).not.toContain('NEEDS_DATA');
    expect(content).not.toContain('RULE_NOT_CONFIGURED');
    expect(content).not.toContain('إدخال المهندس');
    expect(content).not.toContain('fire_protection_design.');
    expect(model.assessment_basis.every((item) => !item.source.includes('fire_protection_design.'))).toBe(true);
  });

  it('renders an A4 cover, TOC, semantic sections, running header/footer, and approval page', () => {
    const model = buildExistingTechnicalReportModel(client, fixture(), { name: 'توقع سلامة', legal_name: 'توقع سلامة للاستشارات' });
    const html = buildExistingFinalTechnicalReportHtml({
      document: buildExistingFinalTechnicalReportDocument(model),
      company: { ...DEFAULT_COMPANY_PROFILE, name: 'توقع سلامة', legal_name: 'توقع سلامة للاستشارات', tagline: 'استشارات السلامة' },
    });

    expect(html).toContain('@page { size:A4 portrait');
    expect(html).toContain('class="official-cover"');
    expect(html).toContain('class="official-toc-page"');
    expect(html).toContain('class="official-table-wrap keep"');
    expect(html).toContain('class="official-approvals keep"');
    expect(html).toContain('@bottom-center');
    expect(html).toContain('التقرير الفني لتقييم الموقع القائم');
    expect(html).not.toContain('http://localhost');
    expect(html).not.toContain('NEEDS_DATA');
  });

  it('does not print unrecorded aggregate zeros as real engineering values', () => {
    const data = parseProjectEngineeringData({ ...EMPTY_PROJECT_ENGINEERING_DATA, design_center: EMPTY_PROJECT_ENGINEERING_DATA.design_center });
    const model = buildExistingTechnicalReportModel(client, data);
    const values = model.engineering_sections.flatMap((section) => section.rows.map((row) => `${row.label}:${row.value}`));

    expect(values).not.toContain('إجمالي المخارج:0');
    expect(values).not.toContain('إجمالي الشاغلين:0');
    expect(values).not.toContain('عدد المرشات:0');
  });

  it('keeps sparse assessment neutral and does not infer compliance', () => {
    const data = parseProjectEngineeringData({ ...EMPTY_PROJECT_ENGINEERING_DATA, existing_assessment: undefined });
    const model = buildExistingTechnicalReportModel(client, data);
    const document = buildExistingFinalTechnicalReportDocument(model);
    const content = JSON.stringify(document);

    expect(model.assessment_sections).toEqual([]);
    expect(model.summary).toEqual({ total_assessed_systems: 0, compliant: 0, non_compliant: 0, needs_completion: 0, not_applicable: 0 });
    expect(content).toContain('لا يتضمن الملف الحالي بنود تقييم مكتملة');
    expect(content).not.toContain('المبنى مطابق');
    expect(content).toContain('لا توجد إجراءات أو توصيات معتمدة مسجلة حتى الآن.');
  });

  it('keeps all four explicit assessment statuses and long Arabic text in the final document', () => {
    const data = fixture();
    data.existing_assessment = {
      version: 1,
      systems: {
        ...(data.existing_assessment?.systems || {}),
        fire_pumps: { compliance_status: 'COMPLIANT' },
        smoke_detectors: { compliance_status: 'NEEDS_COMPLETION', observation: 'ملاحظة طويلة '.repeat(120) },
        voice_evacuation: { compliance_status: 'NOT_APPLICABLE' },
      },
    };
    const model = buildExistingTechnicalReportModel(client, data);
    const content = JSON.stringify(buildExistingFinalTechnicalReportDocument(model));

    expect(model.summary).toEqual({ total_assessed_systems: 4, compliant: 1, non_compliant: 1, needs_completion: 1, not_applicable: 1 });
    expect(content).toContain('مطابق');
    expect(content).toContain('غير مطابق');
    expect(content).toContain('يحتاج استكمال');
    expect(content).toContain('لا ينطبق');
    expect(content).toContain('ملاحظة طويلة');
  });

  it('keeps TechnicalReportPrint on one selected document source while leaving UC on its own builder', () => {
    const source = read('components/projects/TechnicalReportPrint.tsx');
    expect(source).toContain('buildExistingFinalTechnicalReportDocument(model)');
    expect(source).toContain('buildExistingFinalTechnicalReportHtml');
    expect(source).toContain('buildAdminUcTechnicalReportPayload');
    expect(source).not.toContain('generateOfficialTechnicalReportDocument');
    expect(source).not.toContain('buildOfficialTechnicalReportHtml');
  });
});
