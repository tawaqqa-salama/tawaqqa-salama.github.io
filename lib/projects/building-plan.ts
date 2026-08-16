import { ACTIVITY_RULES } from '@/lib/constants/clients';
import type { ClientRecord } from '@/lib/types/client';
import type { BuildingPlanGeneralInfo, BuildingPlanReport } from '@/lib/types/project-reports';

export function getBuildingPlanGeneralInfo(client: ClientRecord): BuildingPlanGeneralInfo {
  const activityLabel = ACTIVITY_RULES[client.activity_type || '']?.label || client.activity_type || '—';
  const districtStreet = [client.district, client.street].filter(Boolean).join(' — ') || '—';
  const locationParts = [client.city, client.district].filter(Boolean);
  const nationalAddress =
    client.national_address ||
    [client.region, client.city, client.district, client.street, client.plot_number ? `قطعة ${client.plot_number}` : '']
      .filter(Boolean)
      .join(' — ') ||
    '—';

  return {
    business_name: client.business_name || client.name || '—',
    owner_name: client.owner_name || '—',
    activity_type_label: activityLabel,
    city: client.city || '—',
    region: client.region || '—',
    district: client.district || '—',
    street: client.street || '—',
    plot_number: client.plot_number || '—',
    land_area: client.land_area ? `${client.land_area} م²` : '—',
    building_area: client.building_area ? `${client.building_area} م²` : '—',
    floors_count: client.floors_count != null ? String(client.floors_count) : '—',
    location_summary: locationParts.length ? locationParts.join(' — ') : '—',
    national_address: nationalAddress,
  };
}

export function mergeBuildingPlanDefaults(report: Partial<BuildingPlanReport>): BuildingPlanReport {
  return {
    status: report.status || 'مسودة',
    updated_at: report.updated_at,
    report_date: report.report_date,
    building_permit_number: report.building_permit_number,
    building_permit_date: report.building_permit_date,
    building_permit_date_hijri: report.building_permit_date_hijri,
    building_permit_expiry_date: report.building_permit_expiry_date,
    permit_type: report.permit_type,
    municipality: report.municipality,
    sub_municipality: report.sub_municipality,
    plan_number: report.plan_number,
    sketch_number: report.sketch_number,
    deed_number: report.deed_number,
    northing: report.northing,
    easting: report.easting,
    licensed_floor_count: report.licensed_floor_count ?? null,
    building_use: report.building_use,
    building_permit_file: report.building_permit_file ?? null,
    building_permit_ocr_status: report.building_permit_ocr_status ?? null,
    building_permit_ocr_message: report.building_permit_ocr_message ?? null,
    occupancy_classification: report.occupancy_classification,
    building_type_code: report.building_type_code,
    sbc_requirements: report.sbc_requirements,
    sbc_code_exceptions: report.sbc_code_exceptions ?? '',
    high_rise_building: report.high_rise_building ?? '',
    total_site_area_m2: report.total_site_area_m2,
    atrium_exists: report.atrium_exists ?? '',
    floors_description: report.floors_description,
    underground_building: report.underground_building ?? '',
    building_height_m: report.building_height_m,
    windowless_building: report.windowless_building ?? '',
    basement_floors_count: report.basement_floors_count,
    electrical_grounding: report.electrical_grounding ?? '',
    underground_depth_m: report.underground_depth_m,
    lightning_protection: report.lightning_protection ?? '',
    exits_count: report.exits_count,
    backup_generator: report.backup_generator ?? '',
    stairs_count: report.stairs_count,
    escalators_count: report.escalators_count,
    elevators_count: report.elevators_count,
    special_rescue_team_required: report.special_rescue_team_required ?? '',
    fire_alarm_system: report.fire_alarm_system ?? '',
    sprinkler_system: report.sprinkler_system ?? '',
    emergency_exits_doors: report.emergency_exits_doors,
    plan_approval_status: report.plan_approval_status,
    technical_inspection_notes: report.technical_inspection_notes,
    office_name: report.office_name,
    commercial_registration: report.commercial_registration,
    engineer_representative: report.engineer_representative,
    engineering_membership_no: report.engineering_membership_no,
    certification_date: report.certification_date,
  };
}

export function seedBuildingPlanFromClient(client: ClientRecord, report: BuildingPlanReport): BuildingPlanReport {
  return mergeBuildingPlanDefaults({
    ...report,
    total_site_area_m2: report.total_site_area_m2 || (client.land_area != null ? String(client.land_area) : undefined),
    floors_description: report.floors_description || (client.floors_count != null ? String(client.floors_count) : undefined),
    engineer_representative: report.engineer_representative || client.assigned_engineer || undefined,
  });
}

export function formatYesNo(value: string | undefined | null): string {
  if (value === 'نعم') return 'نعم';
  if (value === 'لا') return 'لا';
  return '—';
}
