import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { resolveCanonicalEngineeringDataset } from '@/lib/projects/canonical-engineering';
import {
  UNDER_CONSTRUCTION_SYSTEMS,
  normalizeUnderConstructionStudy,
  resolveUnderConstructionProjectReferences,
  resolveUnderConstructionSystemReferences,
} from '@/lib/projects/under-construction-study';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { EMPTY_PROJECT_ENGINEERING_DATA, type ProjectEngineeringData } from '@/lib/types/project-reports';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

function canonical(overrides: Partial<ProjectEngineeringData> = {}): ProjectEngineeringData {
  return parseProjectEngineeringData({ ...EMPTY_PROJECT_ENGINEERING_DATA, ...overrides });
}

const client = {
  name: 'مشروع تجريبي قيد الإنشاء',
  business_name: 'منشأة تجريبية',
  owner_name: 'مالك الاختبار',
  city: 'الرياض',
  district: 'العليا',
  activity_type: 'مكاتب إدارية',
  building_area: 1200,
  floors_count: 3,
};

describe('PR 3 — UNDER_CONSTRUCTION engineering study model', () => {
  it('covers the approved engineering study systems without using existing-site gap or compliance fields', () => {
    expect(UNDER_CONSTRUCTION_SYSTEMS).toContain('fire_truck_access');
    expect(UNDER_CONSTRUCTION_SYSTEMS).toContain('electric_fire_pump');
    expect(UNDER_CONSTRUCTION_SYSTEMS).toContain('sprinkler_system');
    expect(UNDER_CONSTRUCTION_SYSTEMS).toContain('fire_alarm_system');
    expect(UNDER_CONSTRUCTION_SYSTEMS).toContain('grounding');
    expect(normalizeUnderConstructionStudy({ version: 1, systems: {} })).toBeUndefined();

    const result = normalizeUnderConstructionStudy({
      systems: {
        sprinkler_system: {
          applicable: true,
          code_requirement: 'يتطلب النظام وفق المرجع المعتمد.',
          selected_solution: 'شبكة رش آلي حسب التصميم المعتمد.',
          drawing_reference: 'FP-201 Rev. B',
          calculation_reference: 'HYD-01',
          implementation_note: 'تنسيق التنفيذ قبل إغلاق الأسقف.',
          compliance_status: 'COMPLIANT',
          gap_text: 'يجب ألا تُقبل',
        },
      },
    });

    expect(result?.systems.sprinkler_system).toEqual({
      applicable: true,
      code_requirement: 'يتطلب النظام وفق المرجع المعتمد.',
      selected_solution: 'شبكة رش آلي حسب التصميم المعتمد.',
      drawing_reference: 'FP-201 Rev. B',
      calculation_reference: 'HYD-01',
      implementation_note: 'تنسيق التنفيذ قبل إغلاق الأسقف.',
    });
    expect(JSON.stringify(result)).not.toContain('COMPLIANT');
    expect(JSON.stringify(result)).not.toContain('gap_text');
  });

  it('round-trips long Arabic study inputs through the canonical engineering payload', () => {
    const implementation_note = 'ينفذ المقاول الأعمال طبقًا للمخططات المعتمدة مع التنسيق بين الأعمال الميكانيكية والكهربائية قبل إغلاق الأسقف، وتوثيق اختبار الضغط لكل منطقة حسب المرجع المعتمد.';
    const saved = canonical({
      under_construction_study: {
        version: 1,
        project_description: 'دراسة مشروع متعدد الأدوار قيد الإنشاء.',
        code_references: [{ id: 'sbc-1', title: 'الكود السعودي للحريق', reference: 'SBC 801', note: 'مرجع دراسة المشروع' }],
        systems: {
          sprinkler_system: {
            applicable: true,
            code_requirement: 'نظام رش آلي مطلوب حسب التصميم المعتمد.',
            selected_solution: 'نظام Wet Pipe مقسم إلى مناطق وفق المخططات.',
            drawing_reference: 'FP-201 Rev. B',
            calculation_reference: 'HYD-01',
            implementation_note,
          },
          voice_evacuation: { applicable: false, implementation_note: 'غير منطبق وفق نطاق الإشغال المعتمد.' },
        },
      },
    });
    const reloaded = parseProjectEngineeringData(JSON.parse(JSON.stringify(saved)));

    expect(reloaded.under_construction_study?.systems.sprinkler_system?.implementation_note).toBe(implementation_note);
    expect(reloaded.under_construction_study?.systems.voice_evacuation).toEqual({
      applicable: false,
      implementation_note: 'غير منطبق وفق نطاق الإشغال المعتمد.',
    });
    expect(reloaded.under_construction_study?.code_references?.[0]).toEqual({
      id: 'sbc-1',
      title: 'الكود السعودي للحريق',
      reference: 'SBC 801',
      note: 'مرجع دراسة المشروع',
    });
  });

  it('normalizes away unknown systems and never creates a default applicability, requirement, solution, or conclusion', () => {
    const result = normalizeUnderConstructionStudy({
      systems: {
        unknown_system: { applicable: true, selected_solution: 'غير مقبول' },
        sprinkler_system: { unknown: 'ignored' },
      },
    });
    expect(result).toBeUndefined();
  });

  it('exposes Design Center and hydraulic/design values as read-only source references without writing duplicated values into the study', () => {
    const data = canonical({
      building_plan: { ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan, exits_count: '4', electrical_grounding: 'نعم' },
      design_center: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
        space_safety: {
          source: 'project_engineering',
          floors: [{
            id: 'floor-1', label: 'الدور الأول', repeat_count: 1, areas: [{
              id: 'area-1', label: 'مكاتب', area_m2: 1200, hazard_suggested: 'ordinary_hazard_group_1', suppression_suggested: [],
              quantities: { sprinklers: 24, smoke_detectors: 12, heat_detectors: 2, fire_alarm_panels: 1, alarm_panel_locations: ['المدخل'], signs: 4, emergency_lights: 6, emergency_exits: 4, alarm_bells: 3, emergency_stairs: 2, manual_extinguishers: 8, elevators: 0, public_facilities: 0 },
            }],
          }],
        },
      },
      fire_protection_design: {
        ...EMPTY_FIRE_PROTECTION_DESIGN,
        pump: {
          ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
          exists: 'yes',
          rated_flow: { value: 1403, unit: 'GPM', source: 'hydraulic_calc' },
          rated_pressure: { value: 14, unit: 'bar', source: 'hydraulic_calc' },
        },
        sprinkler: { ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler, required: 'yes', system_type: 'Wet Pipe', k_factor: '5.6', design_flow: '1403 GPM' },
      },
    });
    const before = JSON.stringify(data.fire_protection_design);
    const sprinkler = resolveUnderConstructionSystemReferences(data, 'sprinkler_system');
    const pump = resolveUnderConstructionSystemReferences(data, 'electric_fire_pump');
    const project = resolveUnderConstructionProjectReferences(client, data);

    expect(sprinkler).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'نوع النظام', value: 'رطب (Wet Pipe)', raw_reference: 'إدخال المهندس' }),
      expect.objectContaining({ label: 'عدد المرشات حسب مركز التصاميم', value: '24', source: 'DESIGN_CENTER' }),
    ]));
    expect(pump).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'التدفق المقنن', value: '1403 GPM', source: 'HYDRAULIC_CALCULATION' }),
    ]));
    expect(project).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'عدد الأدوار', value: '3' }),
    ]));
    expect(JSON.stringify(data.fire_protection_design)).toBe(before);
    expect(normalizeUnderConstructionStudy({ systems: { electric_fire_pump: { calculation_reference: 'HYD-01' } } }))
      .not.toMatchObject({ systems: { electric_fire_pump: { fire_pump_flow: expect.anything() } } });
  });

  it('uses only canonical live state for under_construction_study and never falls back to legacy JSON', () => {
    const legacy = canonical({
      under_construction_study: { version: 1, systems: { sprinkler_system: { selected_solution: 'حل legacy' } } },
    });
    const liveWithoutStudy = canonical();
    expect(resolveCanonicalEngineeringDataset({ live: liveWithoutStudy, legacy }).under_construction_study).toBeUndefined();

    const liveWithStudy = canonical({
      under_construction_study: { version: 1, systems: { sprinkler_system: { selected_solution: 'حل live' } } },
    });
    expect(resolveCanonicalEngineeringDataset({ live: liveWithStudy, legacy }).under_construction_study?.systems.sprinkler_system?.selected_solution).toBe('حل live');
  });

  it('gates the new UI only on canonical UNDER_CONSTRUCTION and protects EXISTING and NULL routes', () => {
    const modal = read('components/projects/ProjectReportModal.tsx');
    const section = read('components/projects/UnderConstructionStudySection.tsx');

    expect(modal).toContain("projectClassification === 'UNDER_CONSTRUCTION'");
    expect(modal).toContain("projectClassification === 'EXISTING'");
    expect(modal).toContain("projectClassification === null");
    expect(modal).toContain('resolveStage4ProjectClassification');
    expect(modal).toContain('classificationNeedsDataMessage');
    expect(modal).not.toContain("client.project_status === 'UNDER_CONSTRUCTION'");
    expect(section).toContain('دراسة المشروع قيد الإنشاء');
    expect(section).toContain('grid-cols-1');
    expect(section).toContain('لا يستخدم الوضع الراهن أو الفجوة أو قرار المطابقة');
  });

  it('does not use client status, report building status, lifecycle mode, or hydraulic calculations to select the path', () => {
    const model = read('lib/projects/under-construction-study.ts');
    const modal = read('components/projects/ProjectReportModal.tsx');

    expect(model).not.toContain('project_status');
    expect(model).not.toContain('technical_report.building_status');
    expect(model).not.toContain('lifecycle_mode');
    expect(model).not.toContain('calcRequiredTankVolumeM3');
    expect(modal).toContain('resolveStage4ProjectClassification');
  });

  it('keeps the new model outside Technical Report/PDF/routing and does not alter existing_assessment semantics', () => {
    for (const file of [
      'components/projects/TechnicalReportPrint.tsx',
      'components/projects/FinalSafetyReportPrint.tsx',
      'components/projects/CdCoverLetterPrint.tsx',
      'lib/projects/technical-report-source-data.ts',
    ]) {
      expect(read(file)).not.toContain('under_construction_study');
    }
    const existing = read('lib/projects/existing-project-assessment.ts');
    expect(existing).not.toContain('under_construction_study');
  });
});
