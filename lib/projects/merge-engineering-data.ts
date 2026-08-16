import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

type EngineeringPatch = Omit<Partial<ProjectEngineeringData>, 'building_plan' | 'technical_report'> & {
  building_plan?: Record<string, unknown>;
  technical_report?: Record<string, unknown>;
};

/**
 * Controlled merge for engineering JSON. Nested stage objects are merged rather
 * than replaced, so a single-field update cannot erase the remaining persisted fields.
 */
export function mergeProjectEngineeringData(
  current: unknown,
  patch: EngineeringPatch
): ProjectEngineeringData {
  const source = current && typeof current === 'object' ? current as Record<string, unknown> : {};
  const base = parseProjectEngineeringData(source as unknown as ProjectEngineeringData | null);
  const sourceBuildingPlan = source.building_plan && typeof source.building_plan === 'object'
    ? source.building_plan as Record<string, unknown>
    : {};
  const sourceTechnicalReport = source.technical_report && typeof source.technical_report === 'object'
    ? source.technical_report as Record<string, unknown>
    : {};
  return {
    ...base,
    ...source,
    ...patch,
    building_plan: {
      ...base.building_plan,
      ...sourceBuildingPlan,
      ...(patch.building_plan || {}),
    },
    technical_report: {
      ...base.technical_report,
      ...sourceTechnicalReport,
      ...(patch.technical_report || {}),
    },
  } as ProjectEngineeringData;
}
