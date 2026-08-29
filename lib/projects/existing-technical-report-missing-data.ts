import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';
import { buildTechnicalReportSourceData } from '@/lib/projects/technical-report-source-data';
import type { ClientRecord } from '@/lib/types/client';
import {
  EXISTING_AERIAL_MISSING_LABEL,
  EXISTING_CD_ROUTE_MISSING_LABEL,
  EXISTING_FACADE_MISSING_LABEL,
} from '@/lib/projects/existing-technical-report-profile';

export type ExistingTechnicalReportMissingItem = {
  id: string;
  label: string;
  complete: boolean;
};

function hasPhoto(report: TechnicalReport, key: 'facade_photo' | 'earth_photo'): boolean {
  const photo = report[key];
  return Boolean(photo?.dataUrl || photo?.storagePath);
}

function hasCivilDefenseRoute(data: ProjectEngineeringData): boolean {
  const cd = data.technical_report.evidence?.civil_defense;
  const routeId = cd?.route_evidence_id;
  if (routeId) {
    const item = data.technical_report.evidence?.items?.find((entry) => entry.id === routeId);
    if (item?.file?.dataUrl || item?.file?.storagePath) return true;
  }
  return Boolean(
    data.technical_report.evidence?.items?.some(
      (item) => item.kind === 'civil_defense_route' && (item.file?.dataUrl || item.file?.storagePath)
    )
  );
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

/** Checklist for EXISTING final report mandatory inputs — no auto-calculation. */
export function buildExistingTechnicalReportMissingData(
  client: ClientRecord,
  data: ProjectEngineeringData
): ExistingTechnicalReportMissingItem[] {
  const report = data.technical_report;
  const cd = report.evidence?.civil_defense;
  const surroundings = report.site_surroundings;
  const source = buildTechnicalReportSourceData({ client, engineeringData: data });

  return [
    { id: 'facade_photo', label: EXISTING_FACADE_MISSING_LABEL, complete: hasPhoto(report, 'facade_photo') },
    { id: 'aerial_photo', label: EXISTING_AERIAL_MISSING_LABEL, complete: hasPhoto(report, 'earth_photo') },
    { id: 'cd_route_photo', label: EXISTING_CD_ROUTE_MISSING_LABEL, complete: hasCivilDefenseRoute(data) },
    { id: 'location_description', label: 'وصف الموقع', complete: hasText(report.location_description) },
    {
      id: 'site_address',
      label: 'الشارع / الحي / المدينة',
      complete: Boolean(
        hasText(source.project.street.value) ||
          hasText(source.project.district.value) ||
          hasText(source.project.city.value) ||
          hasText(client.street) ||
          hasText(client.district) ||
          hasText(client.city)
      ),
    },
    { id: 'cd_center', label: 'اسم أقرب مركز دفاع مدني', complete: hasText(cd?.center_name) },
    {
      id: 'cd_distance',
      label: 'المسافة إلى مركز الدفاع المدني',
      complete: cd?.distance_value != null && !Number.isNaN(cd.distance_value),
    },
    {
      id: 'cd_travel_time',
      label: 'زمن الوصول بالدقائق',
      complete: cd?.travel_time_minutes != null && !Number.isNaN(cd.travel_time_minutes),
    },
    {
      id: 'components',
      label: 'مكونات المشروع (صف واحد على الأقل)',
      complete: (report.components || []).some((row) => hasText(row.part_name)),
    },
    {
      id: 'surroundings',
      label: 'الجهات المحيطة بالموقع (شمال / جنوب / شرق / غرب)',
      complete: Boolean(
        surroundings &&
          (hasText(surroundings.north) ||
            hasText(surroundings.south) ||
            hasText(surroundings.east) ||
            hasText(surroundings.west))
      ),
    },
  ];
}

export function existingTechnicalReportMissingCount(client: ClientRecord, data: ProjectEngineeringData): number {
  return buildExistingTechnicalReportMissingData(client, data).filter((item) => !item.complete).length;
}
