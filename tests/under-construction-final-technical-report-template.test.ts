import { describe, expect, it } from 'vitest';
import { buildUnderConstructionFinalTechnicalReportHtml } from '@/lib/projects/under-construction-final-report-template';
import { buildUnderConstructionTechnicalReportModel } from '@/lib/projects/under-construction-technical-report-model';
import { EMPTY_PROJECT_ENGINEERING_DATA, EMPTY_TECHNICAL_REPORT, type ProjectEngineeringData } from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';
import type { CompanyProfile } from '@/lib/company-profile';

describe('UNDER_CONSTRUCTION final A4 technical report template', () => {
  const client = {
    id: 'template-test', client_code: 'UC-TEMPLATE', name: 'مشروع تحت الإنشاء', business_name: 'مشروع تحت الإنشاء',
    owner_name: 'مالك المشروع', city: 'الرياض', district: 'العليا', street: 'شارع الاختبار', floors_count: 3,
    primary_engineering_project_identity: { clientId: 'template-test', projectId: 'project-test', projectCode: 'PRJ-2026-000010', projectClassification: 'UNDER_CONSTRUCTION' },
  } as ClientRecord;
  const company = { name: 'توقع سلامة', legal_name: 'توقع سلامة للاستشارات' } as CompanyProfile;
  const data = {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: { ...EMPTY_TECHNICAL_REPORT, outgoing_number: 'TR-UC-10', report_date: '2026-08-26' },
    building_plan: { ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan, building_use: 'مكاتب إدارية', floors_description: 'ثلاثة أدوار', building_permit_number: 'BP-10' },
    fire_protection_design: {
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      applicable_codes: ['SBC 801'],
      occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, occupancy_type: 'مكاتب إدارية', hazard_class: 'ordinary_hazard_group_1', floors_count: '3' },
      sprinkler: { ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler, system_type: 'wet', k_factor: 'K80' },
    },
    under_construction_study: {
      version: 1 as const,
      project_description: 'وصف دراسة المشروع قبل التنفيذ.',
      code_references: [{ id: 'sbc', title: 'الكود السعودي للحريق', reference: 'SBC 801' }],
      systems: {
        sprinkler_system: { applicable: true, code_requirement: 'تغطية المناطق المشمولة', selected_solution: 'نظام رش رطب (Wet Pipe)', implementation_note: 'اختبار الضغط قبل الإغلاق.' },
        fire_alarm_system: { applicable: true, selected_solution: 'لوحة إنذار عنوانية' },
        voice_evacuation: { applicable: false },
      },
    },
  } as ProjectEngineeringData;

  it('renders the final title, project bindings, approval page, and A4 structure from the derived model', () => {
    const model = buildUnderConstructionTechnicalReportModel(client, data, company);
    const html = buildUnderConstructionFinalTechnicalReportHtml({ model, company });
    expect(html).toContain('التقرير الفني للمبنى تحت الإنشاء');
    expect(html).toContain('مشروع تحت الإنشاء');
    expect(html).toContain('الاعتماد والتوقيعات');
    expect(html).toContain('@page { size: A4 portrait;');
    expect(html).toContain('dir="rtl"');
  });

  it('keeps display normalization and user-facing safety boundaries without leaking raw internals', () => {
    const model = buildUnderConstructionTechnicalReportModel(client, data, company);
    const html = buildUnderConstructionFinalTechnicalReportHtml({ model, company });
    expect(html).toContain('K = 80');
    expect(html).toContain('رطب (Wet Pipe)');
    expect(html).not.toContain('ordinary_hazard_group_1');
    expect(html).not.toContain('NEEDS_DATA');
    expect(html).not.toContain('RULE_NOT_CONFIGURED');
    expect(html).not.toContain('template-test');
    expect(html).not.toContain('under_construction_study.');
  });

  it('uses a physical page map only when supplied and removes markers from the final PDF source', () => {
    const model = buildUnderConstructionTechnicalReportModel(client, data, company);
    const pass1 = buildUnderConstructionFinalTechnicalReportHtml({ model, company });
    const final = buildUnderConstructionFinalTechnicalReportHtml({
      model,
      company,
      pageMap: { intro: 3, project: 3, building: 4, basis: 4, requirements: 5, engineering: 9, data: 15, recommendations: 21, summary: 21 },
    });
    expect(pass1).toContain('SECTION_PAGE_introMARKEREND');
    expect(final).not.toContain('SECTION_PAGE_');
    expect(final).toContain('>3</span>');
  });

  it('keeps mobile rules separate from print rules and protects semantic blocks', () => {
    const model = buildUnderConstructionTechnicalReportModel(client, data, company);
    const html = buildUnderConstructionFinalTechnicalReportHtml({ model, company });
    expect(html).toContain('@media screen and (max-width: 600px)');
    expect(html).toContain('@media print');
    expect(html).toContain('page-break-inside: avoid');
    expect(html).not.toContain('overflow-x:');
  });
});
