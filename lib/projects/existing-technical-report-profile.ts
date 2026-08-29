import { componentsFromFloors } from '@/lib/projects/sbc-classification';
import { buildTechnicalReportSourceData } from '@/lib/projects/technical-report-source-data';
import type { ClientRecord } from '@/lib/types/client';
import type {
  CivilDefenseLocationEvidence,
  ProjectEngineeringData,
  TechnicalEvidenceItem,
  TechnicalReportComponentRow,
  TechnicalReportPhoto,
  TechnicalReportSiteSurroundings,
} from '@/lib/types/project-reports';

export type ExistingTechnicalReportSiteProfile = {
  location_text: string | null;
  registered_address: string | null;
  street: string | null;
  district: string | null;
  city: string | null;
  coordinates: string | null;
  maps_url: string | null;
  surrounding_roads: string | null;
  surroundings: TechnicalReportSiteSurroundings | null;
  aerial_src: string | null;
  aerial_caption: string | null;
};

export type ExistingTechnicalReportCivilDefenseAccess = {
  center_name: string | null;
  distance: string | null;
  travel_time: string | null;
  route_description: string | null;
  source_label: string | null;
  maps_source_url: string | null;
  verified_at: string | null;
  map_src: string | null;
  map_caption: string | null;
};

export type ExistingTechnicalReportComponentRow = {
  name: string;
  use: string | null;
  area: string | null;
  height: string | null;
  floors: string | null;
  capacity: string | null;
  description: string | null;
  hazard: string | null;
};

export type ExistingTechnicalReportMedia = {
  facade_src: string | null;
  facade_caption: string | null;
  aerial_src: string | null;
  aerial_caption: string | null;
};

function cleanText(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result || null;
}

function joinLines(items: Array<string | null | undefined>): string | null {
  const values = items.map((item) => cleanText(item)).filter((item): item is string => Boolean(item));
  return values.length ? values.join(' — ') : null;
}

function photoSrc(photo: TechnicalReportPhoto | null | undefined): string | null {
  return cleanText(photo?.dataUrl) || null;
}

function evidenceItem(
  data: ProjectEngineeringData,
  id: string | null | undefined
): TechnicalEvidenceItem | undefined {
  if (!id) return undefined;
  return data.technical_report.evidence?.items?.find((item) => item.id === id);
}

function evidenceFileSrc(item: TechnicalEvidenceItem | undefined): string | null {
  return cleanText(item?.file?.dataUrl) || null;
}

function formatDistance(cd: CivilDefenseLocationEvidence | null | undefined): string | null {
  if (!cd || cd.distance_value == null || Number.isNaN(cd.distance_value)) return null;
  const unit = cd.distance_unit === 'm' ? 'م' : cd.distance_unit === 'km' ? 'كم' : cd.distance_unit || '';
  return `${cd.distance_value}${unit ? ` ${unit}` : ''}`.trim();
}

function formatTravelTime(cd: CivilDefenseLocationEvidence | null | undefined): string | null {
  if (!cd || cd.travel_time_minutes == null || Number.isNaN(cd.travel_time_minutes)) return null;
  return `${cd.travel_time_minutes} دقيقة`;
}

export function buildExistingReportLocation(client: ClientRecord, data: ProjectEngineeringData): string | null {
  const source = buildTechnicalReportSourceData({ client, engineeringData: data });
  const fromSource = joinLines([
    source.project.city.value,
    source.project.district.value,
    source.project.street.value,
    source.project.plot_number.value ? `قطعة ${source.project.plot_number.value}` : null,
    source.project.national_address.value,
  ]);
  if (fromSource) return fromSource;
  return joinLines([client.city, client.district, client.street, client.plot_number ? `قطعة ${client.plot_number}` : null, client.national_address]);
}

export function buildExistingReportFacilityRows(
  client: ClientRecord,
  data: ProjectEngineeringData,
  projectName: string,
  location: string | null
): Array<{ label: string; value: string }> {
  const source = buildTechnicalReportSourceData({ client, engineeringData: data });
  const building = data.building_plan;
  const technical = data.technical_report;
  const rows = [
    { label: 'المنشأة / اسم المشروع', value: projectName },
    { label: 'النشاط', value: source.project.activity.value || client.activity_type },
    { label: 'المالك / المستثمر', value: source.project.owner_name.value || client.owner_name },
    { label: 'رقم رخصة البناء', value: source.project.building_permit_number.value || building.building_permit_number },
    { label: 'تاريخ الرخصة', value: source.project.building_permit_date.value || building.building_permit_date || building.building_permit_date_hijri },
    {
      label: 'مساحة الموقع العام',
      value: source.project.land_area_m2.value != null ? `${source.project.land_area_m2.value} م²` : null,
    },
    {
      label: 'مساحة البناء',
      value: source.project.building_area_m2.value != null
        ? `${source.project.building_area_m2.value} م²`
        : client.building_area
          ? `${client.building_area} م²`
          : null,
    },
    {
      label: 'عدد الأدوار',
      value: source.project.floors_count.value != null
        ? String(source.project.floors_count.value)
        : building.licensed_floor_count ?? (client.floors_count != null ? String(client.floors_count) : null),
    },
    { label: 'وصف الأدوار', value: source.plan.floors_description.value || building.floors_description || technical.floors_description },
    { label: 'تصنيف المبنى', value: technical.building_classification || building.building_type_code },
    { label: 'تصنيف الإشغال', value: source.plan.occupancy_classification.value || building.occupancy_classification },
    { label: 'درجة الخطورة', value: technical.risk_class },
    { label: 'العنوان', value: location },
    { label: 'رابط Google Maps', value: cleanText(technical.maps_url) },
    {
      label: 'الإحداثيات',
      value: cleanText(technical.gps_lat) && cleanText(technical.gps_lng)
        ? `${technical.gps_lat} ، ${technical.gps_lng}`
        : null,
    },
  ];
  return rows
    .map((row) => ({ label: row.label, value: cleanText(String(row.value ?? '')) || '' }))
    .filter((row) => row.value);
}

function formatSurroundings(surroundings: TechnicalReportSiteSurroundings | null | undefined): string | null {
  if (!surroundings) return null;
  const parts = [
    cleanText(surroundings.north) ? `شمالاً: ${surroundings.north}` : null,
    cleanText(surroundings.south) ? `جنوباً: ${surroundings.south}` : null,
    cleanText(surroundings.east) ? `شرقاً: ${surroundings.east}` : null,
    cleanText(surroundings.west) ? `غرباً: ${surroundings.west}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' — ') : null;
}

export function buildExistingReportSiteProfile(
  client: ClientRecord,
  data: ProjectEngineeringData,
  location: string | null
): ExistingTechnicalReportSiteProfile {
  const technical = data.technical_report;
  const source = buildTechnicalReportSourceData({ client, engineeringData: data });
  const design = data.fire_protection_design;
  const lat = cleanText(technical.gps_lat);
  const lng = cleanText(technical.gps_lng);
  const coordinates = lat && lng ? `${lat} ، ${lng}` : null;
  const aerialItem = technical.evidence?.items?.find((item) => item.kind === 'satellite_image' && item.file?.dataUrl);
  const aerial_src = photoSrc(technical.earth_photo) || evidenceFileSrc(aerialItem);
  const surroundings = technical.site_surroundings || null;
  const formattedSurroundings = formatSurroundings(surroundings);
  return {
    location_text: cleanText(technical.location_description),
    registered_address: location,
    street: cleanText(source.project.street.value) || cleanText(client.street),
    district: cleanText(source.project.district.value) || cleanText(client.district),
    city: cleanText(source.project.city.value) || cleanText(client.city),
    coordinates,
    maps_url: cleanText(technical.maps_url),
    surrounding_roads: joinLines([
      formattedSurroundings,
      design?.fire_truck_access?.site_entrance,
      design?.fire_truck_access?.fire_road,
    ]),
    surroundings,
    aerial_src,
    aerial_caption: cleanText(technical.earth_photo?.caption) || cleanText(aerialItem?.title) || 'صورة جوية للموقع',
  };
}

export function buildExistingReportCivilDefenseAccess(data: ProjectEngineeringData): ExistingTechnicalReportCivilDefenseAccess {
  const cd = data.technical_report.evidence?.civil_defense;
  const mapItem = evidenceItem(data, cd?.map_evidence_id)
    || data.technical_report.evidence?.items?.find((item) => item.kind === 'civil_defense_map' && item.file?.dataUrl);
  const routeItem = evidenceItem(data, cd?.route_evidence_id)
    || data.technical_report.evidence?.items?.find((item) => item.kind === 'civil_defense_route' && item.file?.dataUrl);
  const map_src = evidenceFileSrc(routeItem) || evidenceFileSrc(mapItem);
  return {
    center_name: cleanText(cd?.center_name),
    distance: formatDistance(cd),
    travel_time: formatTravelTime(cd),
    route_description: cleanText(cd?.route_description),
    source_label: cleanText(cd?.source_label),
    maps_source_url: cleanText(cd?.maps_source_url),
    verified_at: cleanText(cd?.engineer_confirmed_at),
    map_src,
    map_caption: cleanText(routeItem?.title) || cleanText(mapItem?.title) || 'صورة مسار أقرب مركز دفاع مدني',
  };
}

export function buildExistingReportMedia(data: ProjectEngineeringData): ExistingTechnicalReportMedia {
  const technical = data.technical_report;
  const aerialItem = technical.evidence?.items?.find((item) => item.kind === 'satellite_image' && item.file?.dataUrl);
  return {
    facade_src: photoSrc(technical.facade_photo),
    facade_caption: cleanText(technical.facade_photo?.caption) || 'صورة واجهة المشروع',
    aerial_src: photoSrc(technical.earth_photo) || evidenceFileSrc(aerialItem),
    aerial_caption: cleanText(technical.earth_photo?.caption) || cleanText(aerialItem?.title) || 'صورة جوية للموقع',
  };
}

function componentRows(data: ProjectEngineeringData): TechnicalReportComponentRow[] {
  const fromReport = data.technical_report.components || [];
  if (fromReport.length) return fromReport;
  return componentsFromFloors(data.technical_report.floor_uses || []);
}

export function buildExistingReportComponents(data: ProjectEngineeringData): ExistingTechnicalReportComponentRow[] {
  return componentRows(data).map((row) => ({
    name: row.part_name,
    use: cleanText(row.use),
    area: cleanText(row.area_m2) ? `${row.area_m2} م²` : null,
    height: cleanText(row.height),
    floors: cleanText(row.floors_count),
    capacity: cleanText(row.capacity),
    description: cleanText(row.description) || (cleanText(row.structure) ? `نوع الإنشاء: ${row.structure}` : null),
    hazard: cleanText(row.classification),
  }));
}

export function existingReportDisplayValue(value: string | null | undefined): string {
  return cleanText(value) || 'غير محدد';
}

export const EXISTING_FACADE_MISSING_LABEL = 'لم يتم إرفاق صورة واجهة المشروع';
export const EXISTING_AERIAL_MISSING_LABEL = 'لم يتم إرفاق الصورة الجوية للموقع';
export const EXISTING_CD_ROUTE_MISSING_LABEL = 'لم يتم إرفاق صورة مسار الدفاع المدني';

export const EXISTING_ASSESSMENT_SECTION_IDS = {
  site: 'existing_assessment_site',
  firefighting: 'existing_assessment_firefighting',
  alarm: 'existing_assessment_alarm',
  life_safety: 'existing_assessment_life_safety',
  electrical: 'existing_assessment_electrical',
} as const;

export const EXISTING_MANDATORY_PAGE_SECTIONS = [
  'facility_data',
  'site_information',
  'fire_truck_access',
  'project_components',
] as const;
