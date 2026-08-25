import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import {
  buildExistingTechnicalReportModel,
  existingTechnicalReportStatusLabel,
} from '@/lib/projects/existing-technical-report-model';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';
import { EMPTY_PROJECT_ENGINEERING_DATA, type ProjectEngineeringData } from '@/lib/types/project-reports';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const client: ClientRecord = {
  id: 'existing-client-01',
  client_code: 'CLI-001',
  name: 'موقع قائم تجريبي',
  business_name: 'منشأة الموقع القائم',
  owner_name: 'مالك تجريبي',
  city: 'الرياض',
  district: 'العليا',
  street: 'شارع الاختبار',
  building_area: 1250,
  floors_count: 3,
  activity_type: 'مكاتب إدارية',
  primary_engineering_project_identity: {
    clientId: 'existing-client-01',
    projectId: 'project-01',
    projectCode: 'PRJ-2026-000001',
    projectClassification: 'EXISTING',
  },
};

function canonical(overrides: Partial<ProjectEngineeringData> = {}): ProjectEngineeringData {
  return parseProjectEngineeringData({ ...EMPTY_PROJECT_ENGINEERING_DATA, ...overrides });
}

function reportFixture(): ProjectEngineeringData {
  return canonical({
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'EX-2026-0001',
      report_date: '2026-08-25',
      building_classification: 'GROUP B',
      risk_class: 'خطورة عادية',
      recommendations_v2: {
        version: 1,
        items: [{
          id: 'rec-01',
          library_item_id: 'library-01',
          library_version: '1',
          status: 'approved',
          effective_text_ar: 'توصية معتمدة مرتبطة بنظام الرش.',
          manual_override: false,
          sort_order: 1,
          fingerprint: 'fp-01',
          affected_scopes: [],
          evidence_ids: [],
          code_evidence_ids: [],
          source: 'engineer_manual',
        }],
      },
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      building_use: 'مبنى إداري قائم',
      occupancy_classification: 'مكاتب إدارية',
      exits_count: '4',
      floors_description: 'ثلاثة أدوار تشغيلية',
      building_permit_number: 'BP-77',
    },
    fire_protection_design: {
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      sprinkler: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
        required: 'yes',
        system_type: 'Wet Pipe',
        zones_count: '2',
      },
      pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
        exists: 'yes',
        rated_flow: { value: 1403, unit: 'GPM', source: 'hydraulic_calc' },
        rated_pressure: { value: 14, unit: 'bar', source: 'hydraulic_calc' },
      },
    },
    existing_assessment: {
      version: 1,
      systems: {
        sprinkler_system: {
          applicable: true,
          existing_presence: 'PRESENT',
          observed_configuration: 'شبكة رش قائمة مع منطقة تحتاج مراجعة تفصيلية.',
          observed_specs: [{ id: 'spec-01', label: 'لوحة المنطقة', value: 'غير معرّفة بوضوح' }],
          observation: 'الملاحظة طويلة ومقصودة للتحقق من التفاف النص العربي داخل معاينة الهاتف بعرض 375 بكسل دون اختصار أو قص.',
          required_text: 'لا يجب أن يتقدم هذا النص على المرجع الكانوني.',
          gap_text: 'لم يكتمل التحقق من تعريف منطقة الرش.',
          compliance_status: 'NON_COMPLIANT',
          action_text: 'توثيق المنطقة، مراجعة التغطية، ثم اعتماد المعالجة من المهندس المختص.',
          priority: 'HIGH',
          evidence_ids: ['evidence-spr-01'],
          requirement_reference: 'مرجع يدوي غير مستخدم عند توفر المرجع الكانوني',
          recommendation_id: 'rec-01',
        },
        fire_pumps: {
          applicable: true,
          existing_presence: 'PRESENT',
          compliance_status: 'COMPLIANT',
          observation: 'تم تسجيل معلومات المضخات في التقييم.',
        },
        voice_evacuation: {
          applicable: false,
          compliance_status: 'NOT_APPLICABLE',
        },
        smoke_detectors: {
          applicable: true,
          observation: 'يلزم استكمال بيانات الكواشف قبل إصدار حكم هندسي.',
          compliance_status: 'NEEDS_COMPLETION',
        },
        grounding: {
          applicable: true,
          observation: 'بيان دون حكم صريح.',
        },
      },
    },
  });
}

describe('PR 4 — EXISTING technical report derived model and preview', () => {
  it('derives the report only from canonical assessment and read-only project/design sources without mutating them', () => {
    const data = reportFixture();
    const before = JSON.stringify(data);
    const model = buildExistingTechnicalReportModel(client, data, { legal_name: 'مكتب توقع للاستشارات', name: 'توقع' });
    const sprinkler = model.assessment_sections.flatMap((section) => section.systems).find((item) => item.system_key === 'sprinkler_system');

    expect(model.project_identity).toEqual({ project_code: 'PRJ-2026-000001', project_classification: 'EXISTING' });
    expect(model.project_information).toMatchObject({
      project_name: 'منشأة الموقع القائم',
      owner: 'مالك تجريبي',
      report_number: 'EX-2026-0001',
      consulting_office: 'مكتب توقع للاستشارات',
    });
    expect(sprinkler).toMatchObject({
      applicable: true,
      existing_condition: expect.stringContaining('شبكة رش قائمة'),
      required_condition: 'نظام رش آلي مطلوب · Wet Pipe · 2 منطقة',
      gap: 'لم يكتمل التحقق من تعريف منطقة الرش.',
      compliance_status: 'NON_COMPLIANT',
      required_action: 'توثيق المنطقة، مراجعة التغطية، ثم اعتماد المعالجة من المهندس المختص.',
      requirement_reference: 'بيانات الرش ضمن التصميم الفني',
      requirement_source: 'fire_protection_design.sprinkler',
    });
    expect(sprinkler?.required_condition).not.toContain('لا يجب أن يتقدم');
    expect(sprinkler?.evidence).toEqual([{ id: 'evidence-spr-01', system_key: 'sprinkler_system', system_label: 'نظام الرش الآلي' }]);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('counts only explicit approved assessment statuses and never treats an incomplete item as compliant', () => {
    const model = buildExistingTechnicalReportModel(client, reportFixture());
    const grounding = model.assessment_sections.flatMap((section) => section.systems).find((item) => item.system_key === 'grounding');

    expect(model.summary).toEqual({
      total_assessed_systems: 4,
      compliant: 1,
      non_compliant: 1,
      needs_completion: 1,
      not_applicable: 1,
    });
    expect(grounding?.compliance_status).toBe('INCOMPLETE');
    expect(existingTechnicalReportStatusLabel('INCOMPLETE')).toBe('لم يكتمل تقييم هذا البند.');
    expect(existingTechnicalReportStatusLabel('NOT_APPLICABLE')).toBe('غير منطبق');
  });

  it('keeps observed, required, gap, status, and action as separate model fields including long Arabic text', () => {
    const model = buildExistingTechnicalReportModel(client, reportFixture());
    const sprinkler = model.assessment_sections.flatMap((section) => section.systems).find((item) => item.system_key === 'sprinkler_system');

    expect(sprinkler?.existing_condition).toContain('شبكة رش قائمة');
    expect(sprinkler?.required_condition).toContain('نظام رش آلي مطلوب');
    expect(sprinkler?.gap).toContain('لم يكتمل التحقق');
    expect(sprinkler?.compliance_status).toBe('NON_COMPLIANT');
    expect(sprinkler?.required_action).toContain('توثيق المنطقة');
    expect(sprinkler?.notes).toContain('عرض 375 بكسل');
    expect(sprinkler?.existing_condition).not.toBe(sprinkler?.required_condition);
  });

  it('derives recommendations only from explicit actions and approved stored recommendations without generating any', () => {
    const model = buildExistingTechnicalReportModel(client, reportFixture());

    expect(model.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'ASSESSMENT_ACTION', system_key: 'sprinkler_system', text: expect.stringContaining('توثيق المنطقة') }),
      expect.objectContaining({ source: 'APPROVED_RECOMMENDATION', system_key: 'sprinkler_system', text: 'توصية معتمدة مرتبطة بنظام الرش.' }),
    ]));

    const noActions = canonical({
      existing_assessment: { version: 1, systems: { fire_pumps: { compliance_status: 'NON_COMPLIANT' } } },
    });
    expect(buildExistingTechnicalReportModel(client, noActions).recommendations).toEqual([]);
  });

  it('keeps missing assessment neutral and excludes systems without assessment data rather than creating diagnostic placeholders', () => {
    const noAssessment = canonical();
    const model = buildExistingTechnicalReportModel(client, noAssessment);
    expect(model.assessment_sections).toEqual([]);
    expect(model.summary).toEqual({ total_assessed_systems: 0, compliant: 0, non_compliant: 0, needs_completion: 0, not_applicable: 0 });
    expect(JSON.stringify(model)).not.toContain('undefined');
    expect(JSON.stringify(model)).not.toContain('NEEDS_DATA');
    expect(JSON.stringify(model)).not.toContain('BLOCKED');
    expect(JSON.stringify(model)).not.toContain('RULE_NOT_CONFIGURED');
  });

  it('uses canonical classification routing for the read-only preview and protects UNDER_CONSTRUCTION and legacy NULL', () => {
    const modal = read('components/projects/ProjectReportModal.tsx');
    const preview = read('components/projects/ExistingTechnicalReportPreview.tsx');
    const route = modal.slice(modal.indexOf("projectClassification === 'EXISTING'"), modal.indexOf("{activeStage === 'visits_supervision'"));

    expect(route).toContain("projectClassification === 'EXISTING'");
    expect(route).toContain("projectClassification === null");
    expect(route).toContain('ExistingTechnicalReportPreview');
    expect(route).toContain('لا يمكن فتح معاينة التقرير الفني لمسار الموقع القائم قبل تصنيف هوية المشروع');
    expect(route).not.toContain('project_status');
    expect(route).not.toContain('building_status');
    expect(route).not.toContain('lifecycle_mode');
    expect(preview).toContain('dir="rtl"');
    expect(preview).toContain('grid-cols-1');
    expect(preview).toContain('lg:grid-cols-2');
  });

  it('keeps preview free of save, mutation, print, download, and PDF calls and leaves PDF renderers untouched', () => {
    const preview = read('components/projects/ExistingTechnicalReportPreview.tsx');
    const model = read('lib/projects/existing-technical-report-model.ts');
    expect(preview).not.toContain('save_project_engineering_live');
    expect(preview).not.toContain('onSave');
    expect(preview).not.toContain('onPreview');
    expect(preview).not.toContain('onPrint');
    expect(preview).not.toContain('onDownload');
    expect(preview).not.toContain('<button');
    expect(model).not.toContain('save_project_engineering_live');
    for (const file of [
      'components/projects/TechnicalReportPrint.tsx',
      'components/projects/FinalSafetyReportPrint.tsx',
      'components/projects/CdCoverLetterPrint.tsx',
      'lib/projects/official-technical-report-document.ts',
    ]) {
      expect(read(file)).not.toContain('ExistingTechnicalReportPreview');
      expect(read(file)).not.toContain('existing-technical-report-model');
    }
  });
});
