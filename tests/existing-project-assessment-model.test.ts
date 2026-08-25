import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import {
  EXISTING_ASSESSMENT_COMPLIANCE_STATUS_VALUES,
  EXISTING_ASSESSMENT_SYSTEMS,
  normalizeExistingProjectAssessment,
  resolveExistingAssessmentRequirement,
} from '@/lib/projects/existing-project-assessment';
import { resolveCanonicalEngineeringDataset } from '@/lib/projects/canonical-engineering';
import { EMPTY_PROJECT_ENGINEERING_DATA, type ProjectEngineeringData } from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

function canonical(overrides: Partial<ProjectEngineeringData> = {}): ProjectEngineeringData {
  return parseProjectEngineeringData({ ...EMPTY_PROJECT_ENGINEERING_DATA, ...overrides });
}

describe('PR 2 — EXISTING project assessment canonical model', () => {
  it('covers the approved system set without creating default engineer conclusions', () => {
    expect(EXISTING_ASSESSMENT_SYSTEMS).toEqual([
      'fire_truck_access',
      'fdc',
      'fire_water_source',
      'fire_tank',
      'fire_pumps',
      'standpipe',
      'hose_reel_hydrant',
      'sprinkler_system',
      'special_suppression',
      'fire_extinguishers',
      'mechanical_ventilation',
      'smoke_control',
      'fire_alarm_control_panel',
      'smoke_detectors',
      'heat_detectors',
      'manual_call_points',
      'alarm_notification_devices',
      'voice_evacuation',
      'emergency_lighting',
      'exit_signs',
      'means_of_egress',
      'electrical_safety',
      'grounding',
      'lightning_protection',
      'emergency_power',
    ]);
    expect(normalizeExistingProjectAssessment({ version: 1, systems: {} })).toBeUndefined();
  });

  it.each(EXISTING_ASSESSMENT_COMPLIANCE_STATUS_VALUES)(
    'accepts the explicit compliance status %s without inferring another one',
    (compliance_status) => {
      const result = normalizeExistingProjectAssessment({
        systems: { sprinkler_system: { compliance_status } },
      });
      expect(result?.systems.sprinkler_system?.compliance_status).toBe(compliance_status);
    }
  );

  it('preserves an incomplete assessment and an explicit not-applicable system separately', () => {
    const result = normalizeExistingProjectAssessment({
      systems: {
        fire_pumps: { observed_configuration: 'مجموعة مضخات تحتاج معاينة تفصيلية' },
        voice_evacuation: { applicable: false, compliance_status: 'NOT_APPLICABLE' },
      },
    });

    expect(result?.systems.fire_pumps).toEqual({
      observed_configuration: 'مجموعة مضخات تحتاج معاينة تفصيلية',
    });
    expect(result?.systems.voice_evacuation).toEqual({
      applicable: false,
      compliance_status: 'NOT_APPLICABLE',
    });
  });

  it('round-trips long Arabic observations and actions through the engineering payload', () => {
    const observation = 'تمت معاينة غرفة المضخات وتبين وجود عوائق أمام الوصول إلى لوحة التحكم، ويستلزم ذلك مراجعة تفصيلية قبل إصدار أي حكم مطابقة.';
    const action = 'إزالة العوائق، التحقق من اللوحات والمضخات ميدانيًا، وتوثيق النتيجة من مهندس السلامة قبل اعتماد أي معالجة.';
    const saved = canonical({
      existing_assessment: {
        version: 1,
        systems: {
          fire_pumps: {
            existing_presence: 'PRESENT',
            observation,
            action_text: action,
            observed_specs: [{ id: 'pump-spec-1', label: 'رقم الطراز', value: 'غير ظاهر في المعاينة الأولية' }],
          },
        },
      },
    });
    const reloaded = parseProjectEngineeringData(JSON.parse(JSON.stringify(saved)));

    expect(reloaded.existing_assessment?.systems.fire_pumps?.observation).toBe(observation);
    expect(reloaded.existing_assessment?.systems.fire_pumps?.action_text).toBe(action);
    expect(reloaded.existing_assessment?.systems.fire_pumps?.observed_specs).toEqual([
      { id: 'pump-spec-1', label: 'رقم الطراز', value: 'غير ظاهر في المعاينة الأولية' },
    ]);
  });

  it('rejects unknown systems and invalid conclusion labels rather than inventing data', () => {
    const result = normalizeExistingProjectAssessment({
      systems: {
        unknown_system: { compliance_status: 'COMPLIANT' },
        sprinkler_system: { compliance_status: 'AUTO_PASS', condition: 'EXCELLENT' },
      },
    });
    expect(result).toBeUndefined();
  });

  it('keeps observed condition separate from a read-only canonical requirement source', () => {
    const data = canonical({
      fire_protection_design: {
        ...EMPTY_FIRE_PROTECTION_DESIGN,
        sprinkler: {
          ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
          required: 'yes',
          system_type: 'Wet Pipe',
          zones_count: '3',
        },
      },
    });
    const snapshot = JSON.stringify(data.fire_protection_design);
    const requirement = resolveExistingAssessmentRequirement(data, 'sprinkler_system');

    expect(requirement).toEqual({
      text: 'نظام رش آلي مطلوب · Wet Pipe · 3 منطقة',
      source: 'fire_protection_design.sprinkler',
      reference: 'بيانات الرش ضمن التصميم الفني',
    });
    expect(JSON.stringify(data.fire_protection_design)).toBe(snapshot);
  });

  it('uses only canonical live state for existing_assessment and never falls back to clients legacy JSON', () => {
    const legacy = canonical({
      existing_assessment: {
        version: 1,
        systems: { fire_pumps: { compliance_status: 'NON_COMPLIANT', gap_text: 'legacy gap' } },
      },
    });
    const liveWithoutAssessment = canonical();
    const withoutLiveAssessment = resolveCanonicalEngineeringDataset({ live: liveWithoutAssessment, legacy });
    expect(withoutLiveAssessment.existing_assessment).toBeUndefined();

    const liveWithAssessment = canonical({
      existing_assessment: {
        version: 1,
        systems: { fire_pumps: { compliance_status: 'NEEDS_COMPLETION', gap_text: 'live gap' } },
      },
    });
    const withLiveAssessment = resolveCanonicalEngineeringDataset({ live: liveWithAssessment, legacy });
    expect(withLiveAssessment.existing_assessment?.systems.fire_pumps?.gap_text).toBe('live gap');
    expect(withLiveAssessment.existing_assessment?.systems.fire_pumps?.compliance_status).toBe('NEEDS_COMPLETION');
  });

  it('gates the UI only on canonical ProjectContext classification and provides neutral NULL handling', () => {
    const modal = read('components/projects/ProjectReportModal.tsx');
    const section = read('components/projects/ExistingProjectAssessmentSection.tsx');

    expect(modal).toContain("projectClassification === 'EXISTING'");
    expect(modal).toContain("projectClassification === null");
    expect(modal).toContain('المشروع القديم غير المصنف\n                      يبقى محايدًا');
    expect(modal).not.toContain("client.project_status === 'EXISTING'");
    expect(section).toContain('حفظ تقييم الموقع القائم');
    expect(section).toContain('grid-cols-1');
  });

  it('does not use operational status, technical-report status, lifecycle mode, or hydraulic calculations to choose the path', () => {
    const model = read('lib/projects/existing-project-assessment.ts');
    const modal = read('components/projects/ProjectReportModal.tsx');

    expect(model).not.toContain('project_status');
    expect(model).not.toContain('technical_report.building_status');
    expect(model).not.toContain('lifecycle_mode');
    expect(model).not.toContain('calcRequiredTankVolumeM3');
    expect(modal).toContain('projectClassification = client.primary_engineering_project_identity?.projectClassification ?? null');
  });

  it('keeps the assessment UI outside Technical Report PDF and report routing components', () => {
    const files = [
      'components/projects/TechnicalReportPrint.tsx',
      'components/projects/FinalSafetyReportPrint.tsx',
      'components/projects/CdCoverLetterPrint.tsx',
      'lib/projects/technical-report-source-data.ts',
    ];
    for (const file of files) {
      expect(read(file)).not.toContain('existing_assessment');
    }
  });
});
