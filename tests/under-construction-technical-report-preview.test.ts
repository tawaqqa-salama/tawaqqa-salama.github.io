import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import {
  buildUnderConstructionTechnicalReportModel,
  UNDER_CONSTRUCTION_REPORT_SECTION_SOURCE_MATRIX,
} from '@/lib/projects/under-construction-technical-report-model';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';
import { EMPTY_PROJECT_ENGINEERING_DATA, type ProjectEngineeringData } from '@/lib/types/project-reports';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const underConstructionClient: ClientRecord = {
  id: 'under-construction-client-01',
  client_code: 'CLI-UC-001',
  name: 'مشروع قيد الإنشاء تجريبي',
  business_name: 'منشأة تجريبية قيد الإنشاء',
  owner_name: 'مالك المشروع التجريبي',
  city: 'الرياض',
  district: 'العليا',
  street: 'طريق الاختبار',
  building_area: 1200,
  floors_count: 3,
  activity_type: 'مكاتب إدارية',
  primary_engineering_project_identity: {
    clientId: 'under-construction-client-01',
    projectId: 'project-uc-01',
    projectCode: 'PRJ-2026-000004',
    projectClassification: 'UNDER_CONSTRUCTION',
  },
};

function canonical(overrides: Partial<ProjectEngineeringData> = {}): ProjectEngineeringData {
  return parseProjectEngineeringData({ ...EMPTY_PROJECT_ENGINEERING_DATA, ...overrides });
}

function reportFixture(): ProjectEngineeringData {
  return canonical({
    technical_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
      outgoing_number: 'UC-2026-0001',
      report_date: '2026-08-25',
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      building_use: 'مبنى إداري قيد الإنشاء',
      occupancy_classification: 'مكاتب إدارية',
      exits_count: '4',
      floors_description: 'ثلاثة أدوار تشغيلية مع سطح خدمات',
      electrical_grounding: 'نعم',
      lightning_protection: 'نعم',
      backup_generator: 'نعم',
      fire_alarm_system: 'نعم',
    },
    design_center: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
      space_safety: {
        source: 'project_engineering',
        floors: [{
          id: 'floor-1',
          label: 'الدور الأول',
          repeat_count: 1,
          areas: [{
            id: 'area-1',
            label: 'مكاتب',
            area_m2: 1200,
            hazard_suggested: 'ordinary_hazard_group_1',
            suppression_suggested: [],
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
      applicable_codes: ['SBC 801', 'NFPA 13'],
      fire_truck_access: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.fire_truck_access,
        fire_road: 'طريق وصول معتمد بعرض 6 م',
        civil_defense_connection: 'وصلة FDC مطلوبة',
        source: 'project_drawings',
      },
      pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
        exists: 'yes',
        rated_flow: { value: 1403, unit: 'GPM', source: 'hydraulic_calc' },
        rated_pressure: { value: 14, unit: 'bar', source: 'hydraulic_calc' },
      },
      sprinkler: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
        required: 'yes',
        system_type: 'Wet Pipe',
        sprinkler_type: 'Upright',
        k_factor: '5.6',
        design_pressure: '14 bar',
        design_flow: '1403 GPM',
        source: 'hydraulic_calc',
      },
      occupancy: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy,
        hazard_class: 'ordinary_hazard_group_1',
        source: 'project_drawings',
      },
      fire_alarm: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.fire_alarm,
        control_panel: 'FACP Addressable',
        smoke_detectors: 'Addressable smoke detectors',
        source: 'project_drawings',
      },
      supporting_systems: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.supporting_systems,
        ventilation: { status: 'by_design', note: 'حسب مخططات التهوية', source: 'project_drawings' },
        emergency_power: { status: 'required', note: 'مولد احتياطي', source: 'engineer_input' },
      },
    },
    under_construction_study: {
      version: 1,
      project_description: 'دراسة متطلبات أنظمة الحماية من الحريق لمبنى إداري قيد الإنشاء وفق التصميم المعتمد.',
      code_references: [{ id: 'code-1', title: 'الكود السعودي للحريق', reference: 'SBC 801', note: 'المرجع الرئيس للدراسة' }],
      general_implementation_notes: 'ينفذ المقاول الأعمال وفق المخططات المعتمدة مع توثيق الاختبارات قبل التسليم.',
      systems: {
        fire_truck_access: {
          applicable: true,
          code_requirement: 'يجب توفير وصول مناسب لآليات الدفاع المدني وفق المرجع المعتمد.',
          selected_solution: 'مسار وصول موضح في المخطط العام.',
          drawing_reference: 'FP-001 Rev. B',
          implementation_note: 'لا تُحجب مسارات الوصول أثناء التنفيذ.',
        },
        electric_fire_pump: {
          applicable: true,
          code_requirement: 'يلزم تنفيذ مضخة حريق كهربائية حسب الحساب الهيدروليكي المعتمد.',
          selected_solution: 'مضخة كهربائية ضمن غرفة المضخات المعتمدة.',
          drawing_reference: 'FP-201 Rev. B',
          calculation_reference: 'HYD-01',
          implementation_note: 'يجب تنسيق غرفة المضخات مع الأعمال الكهربائية والميكانيكية.',
        },
        sprinkler_system: {
          applicable: true,
          code_requirement: 'يجب تنفيذ شبكة رش آلي وفق الكود والتصميم المعتمد.',
          selected_solution: 'نظام Wet Pipe مقسم إلى مناطق حسب المخططات.',
          code_reference: 'NFPA 13',
          drawing_reference: 'FP-301 Rev. B',
          calculation_reference: 'HYD-01',
          implementation_note: 'يلزم اختبار الضغط قبل إغلاق الأسقف.',
        },
        fire_alarm_system: {
          applicable: true,
          code_requirement: 'يلزم تنفيذ نظام إنذار مبكر مرتبط بلوحة التحكم.',
          selected_solution: 'نظام عنواني حسب مخطط الإنذار.',
          drawing_reference: 'FA-101 Rev. A',
        },
        voice_evacuation: {
          applicable: false,
          implementation_note: 'غير منطبق وفق نطاق الإشغال المعتمد.',
        },
        smoke_control: {
          applicable: true,
        },
      },
    },
  });
}

describe('PR 5 — UNDER_CONSTRUCTION technical report derived model and preview', () => {
  it('derives a read-only report from explicit study decisions and canonical project/design sources without mutating any source', () => {
    const data = reportFixture();
    const before = JSON.stringify(data);
    const model = buildUnderConstructionTechnicalReportModel(underConstructionClient, data, { legal_name: 'مكتب توقع للاستشارات', name: 'توقع' });
    const sprinkler = model.report_sections.flatMap((section) => section.systems).find((item) => item.system_key === 'sprinkler_system');
    const pump = model.report_sections.flatMap((section) => section.systems).find((item) => item.system_key === 'electric_fire_pump');

    expect(model.project_identity).toEqual({ project_code: 'PRJ-2026-000004', project_classification: 'UNDER_CONSTRUCTION' });
    expect(model.project_information).toMatchObject({
      project_name: 'منشأة تجريبية قيد الإنشاء',
      owner: 'مالك المشروع التجريبي',
      report_number: 'UC-2026-0001',
      consulting_office: 'مكتب توقع للاستشارات',
    });
    expect(model.study_scope).toContain('دراسة متطلبات');
    expect(sprinkler).toMatchObject({
      applicable: true,
      code_requirement: 'يجب تنفيذ شبكة رش آلي وفق الكود والتصميم المعتمد.',
      selected_solution: 'نظام رطب (Wet Pipe) مقسم إلى مناطق حسب المخططات.',
      drawing_reference: 'FP-301 Rev. B',
      calculation_reference: 'HYD-01',
      implementation_note: 'يلزم اختبار الضغط قبل إغلاق الأسقف.',
    });
    expect(sprinkler?.canonical_references).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'نوع النظام', value: 'رطب (Wet Pipe)' }),
      expect.objectContaining({ label: 'تصنيف الخطورة', value: 'خطورة عادية — المجموعة الأولى' }),
      expect.objectContaining({ label: 'نوع المرشات', value: 'رشاش رأسي (Upright)' }),
      expect.objectContaining({ label: 'عدد المرشات حسب مركز التصاميم', value: '24', source: 'DESIGN_CENTER' }),
    ]));
    expect(pump?.canonical_references).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'التدفق المقنن', value: '1403 GPM', source: 'HYDRAULIC_CALCULATION' }),
      expect.objectContaining({ label: 'الضغط المقنن', value: '14 bar', source: 'HYDRAULIC_CALCULATION' }),
    ]));
    expect(JSON.stringify(data)).toBe(before);
  });

  it('keeps engineering outputs at their original canonical references and never duplicates them into the study decision model', () => {
    const data = reportFixture();
    const model = buildUnderConstructionTechnicalReportModel(underConstructionClient, data);
    const pump = model.report_sections.flatMap((section) => section.systems).find((item) => item.system_key === 'electric_fire_pump');

    expect(data.under_construction_study?.systems.electric_fire_pump).not.toMatchObject({
      rated_flow: expect.anything(),
      rated_pressure: expect.anything(),
      tank_capacity: expect.anything(),
    });
    expect(pump).not.toMatchObject({ rated_flow: expect.anything(), rated_pressure: expect.anything(), tank_capacity: expect.anything() });
    expect(pump?.canonical_references).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'HYDRAULIC_CALCULATION', value: '1403 GPM' }),
    ]));
  });

  it('uses only explicit study systems, omits non-applicable systems, and never creates automatic requirements or conclusions for missing data', () => {
    const model = buildUnderConstructionTechnicalReportModel(underConstructionClient, reportFixture());
    const systems = model.report_sections.flatMap((section) => section.systems);
    const voice = systems.find((item) => item.system_key === 'voice_evacuation');
    const smokeControl = systems.find((item) => item.system_key === 'smoke_control');

    expect(voice).toBeUndefined();
    expect(smokeControl).toMatchObject({
      applicable: true,
      code_requirement: null,
      selected_solution: null,
      implementation_note: null,
      canonical_references: [],
    });
    expect(systems.map((item) => item.system_key)).not.toContain('fire_tank');
    expect(JSON.stringify(model)).not.toContain('undefined');
    expect(JSON.stringify(model)).not.toContain('NEEDS_DATA');
    expect(JSON.stringify(model)).not.toContain('BLOCKED');
    expect(JSON.stringify(model)).not.toContain('RULE_NOT_CONFIGURED');
  });

  it('includes only recorded code references and explicit implementation notes, without generating recommendations', () => {
    const model = buildUnderConstructionTechnicalReportModel(underConstructionClient, reportFixture());

    expect(model.code_references).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'الكود السعودي للحريق', reference: 'SBC 801', source: 'UNDER_CONSTRUCTION_STUDY' }),
      expect.objectContaining({ reference: 'NFPA 13', source: 'FIRE_PROTECTION_DESIGN' }),
    ]));
    expect(model.implementation_notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'general', text: expect.stringContaining('ينفذ المقاول') }),
      expect.objectContaining({ system_key: 'sprinkler_system', text: expect.stringContaining('اختبار الضغط') }),
    ]));
    expect(JSON.stringify(model)).not.toContain('recommendations');
  });

  it('deduplicates an identical reader-facing code reference while retaining both internal provenances and hiding raw paths from display fields', () => {
    const model = buildUnderConstructionTechnicalReportModel(underConstructionClient, reportFixture());
    const sbc = model.code_references.filter((item) => item.reference === 'SBC 801');
    const projectCodes = model.project_references.find((item) => item.label === 'الأكواد والمراجع المتاحة');

    expect(sbc).toHaveLength(1);
    expect(sbc[0]?.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'UNDER_CONSTRUCTION_STUDY' }),
      expect.objectContaining({ source: 'FIRE_PROTECTION_DESIGN' }),
    ]));
    expect(projectCodes).toMatchObject({
      reference: 'التصميم الفني لأنظمة الحريق',
      raw_reference: 'fire_protection_design.applicable_codes',
    });
  });

  it('defines a traceable source matrix for project, study, design center, and hydraulic source families', () => {
    expect(UNDER_CONSTRUCTION_REPORT_SECTION_SOURCE_MATRIX).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'بيانات التقرير والمشروع', sources: expect.arrayContaining(['project identity', 'building_plan']) }),
      expect.objectContaining({ section: 'أنظمة مكافحة الحريق', sources: expect.arrayContaining(['under_construction_study.systems', 'hydraulic calculation outputs']) }),
    ]));
  });

  it('routes only canonical UNDER_CONSTRUCTION to the new preview, keeps EXISTING on its own preview, and leaves NULL neutral', () => {
    const modal = read('components/projects/ProjectReportModal.tsx');
    const preview = read('components/projects/UnderConstructionTechnicalReportPreview.tsx');
    const route = modal.slice(modal.indexOf("projectClassification === 'EXISTING'"), modal.indexOf("{activeStage === 'visits_supervision'"));

    expect(route).toContain("projectClassification === 'EXISTING'");
    expect(route).toContain("projectClassification === 'UNDER_CONSTRUCTION'");
    expect(route).toContain('ExistingTechnicalReportPreview');
    expect(route).toContain('UnderConstructionTechnicalReportPreview');
    expect(route).toContain('projectClassification === null');
    expect(route).not.toContain('project_status');
    expect(route).not.toContain('building_status');
    expect(route).not.toContain('lifecycle_mode');
    expect(preview).toContain('dir="rtl"');
    expect(preview).toContain('grid-cols-1');
    expect(preview).toContain('lg:grid-cols-2');
  });

  it('keeps the preview free of mutations, print, download, PDF, and existing-site assessment terminology', () => {
    const preview = read('components/projects/UnderConstructionTechnicalReportPreview.tsx');
    const model = read('lib/projects/under-construction-technical-report-model.ts');
    const existingPreview = read('components/projects/ExistingTechnicalReportPreview.tsx');

    expect(preview).not.toContain('save_project_engineering_live');
    expect(preview).not.toContain('onSave');
    expect(preview).not.toContain('onPreview');
    expect(preview).not.toContain('onPrint');
    expect(preview).not.toContain('onDownload');
    expect(preview).not.toContain('<button');
    expect(preview).not.toContain('الوضع الراهن');
    expect(preview).not.toContain('الفجوة');
    expect(preview).not.toContain('قرار المطابقة');
    expect(preview).not.toContain('fire_protection_design.');
    expect(preview).toContain('المراجع وملاحظات التنفيذ');
    expect(model).not.toContain('save_project_engineering_live');
    expect(model).not.toContain('existing_assessment');
    expect(existingPreview).toContain('التقرير الفني لتقييم الموقع القائم');
    for (const file of [
      'components/projects/TechnicalReportPrint.tsx',
      'components/projects/FinalSafetyReportPrint.tsx',
      'components/projects/CdCoverLetterPrint.tsx',
      'lib/projects/official-technical-report-document.ts',
    ]) {
      expect(read(file)).not.toContain('UnderConstructionTechnicalReportPreview');
      expect(read(file)).not.toContain('under-construction-technical-report-model');
    }
  });
});
