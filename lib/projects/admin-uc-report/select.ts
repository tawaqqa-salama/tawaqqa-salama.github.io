import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';

const ADMIN_ACTIVITY_TYPES = new Set(['office', 'administrative', 'admin']);

const UNDER_CONSTRUCTION_STATUSES = new Set(['تحت الإنشاء', 'under_construction', 'Under Construction']);

export function isAdministrativeBuildingActivity(activityType?: string | null): boolean {
  return ADMIN_ACTIVITY_TYPES.has(String(activityType || '').trim().toLowerCase());
}

export function isUnderConstructionStatus(
  projectStatus?: string | null,
  buildingStatus?: string | null
): boolean {
  const a = String(projectStatus || '').trim();
  const b = String(buildingStatus || '').trim();
  return UNDER_CONSTRUCTION_STATUSES.has(a) || UNDER_CONSTRUCTION_STATUSES.has(b);
}

/**
 * Template selector: Administrative building + under construction
 * → independent report (not Nasaim / existing-building hotel study).
 */
export function shouldUseAdminUcReport(params: {
  client: ClientRecord;
  report?: TechnicalReport | null;
  engineeringData?: ProjectEngineeringData | null;
}): boolean {
  const activity = params.client.activity_type;
  const buildingStatus =
    params.report?.building_status ||
    params.engineeringData?.technical_report?.building_status ||
    null;
  const projectStatus = params.client.project_status;
  return (
    isAdministrativeBuildingActivity(activity) &&
    isUnderConstructionStatus(projectStatus, buildingStatus)
  );
}

export function resolveLifecycleMode(params: {
  client: ClientRecord;
  report?: TechnicalReport | null;
}): 'under_construction' | 'existing_building' {
  if (isUnderConstructionStatus(params.client.project_status, params.report?.building_status)) {
    return 'under_construction';
  }
  return 'existing_building';
}
