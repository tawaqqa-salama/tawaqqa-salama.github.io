import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { projectSafetyTotals } from '@/lib/projects/design-center/space-safety';
import { hazardClassificationLabel } from '@/lib/projects/design-center/safety-rules';
import type { DesignSpaceSafetyWorkingCopy } from '@/lib/projects/design-center/types';
import type { ClientRecord } from '@/lib/types/client';
import type { BuildingPlanGeneralInfo, BuildingPlanReport, YesNoValue } from '@/lib/types/project-reports';

export type DerivedPlanInfoFromSpaceSafety = {
  hasSource: boolean;
  estimatedOccupants: number | null;
  exitsCount: number | null;
  stairsCount: number | null;
  fireAlarmSystem: YesNoValue;
  sprinklerSystem: YesNoValue;
  hazardSummary: string | null;
  quantitiesSummary: string | null;
};

/** Ephemeral display fields used by the print/export view only; never persisted into the report. */
export type BuildingPlanReportWithSpaceSafety = BuildingPlanReport & {
  derived_space_safety_occupants?: string;
  derived_space_safety_quantities?: string;
};

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

/**
 * Read-only engineering derivation for plan information.
 * It intentionally does not write to the report or Sales. An empty field in the
 * engineer report may display these values, while an explicit engineer value always wins.
 */
export function derivePlanInfoFromSpaceSafety(
  spaceSafety?: DesignSpaceSafetyWorkingCopy | null
): DerivedPlanInfoFromSpaceSafety {
  // Seeded Sales data is a starting point only. The bridge activates after the engineer saves a project-scoped copy.
  const hasSource = Boolean(
    spaceSafety?.source === 'project_engineering' && spaceSafety.floors.some((floor) => floor.areas.length)
  );
  if (!spaceSafety || !hasSource) {
    return {
      hasSource: false,
      estimatedOccupants: null,
      exitsCount: null,
      stairsCount: null,
      fireAlarmSystem: '',
      sprinklerSystem: '',
      hazardSummary: null,
      quantitiesSummary: null,
    };
  }

  const totals = projectSafetyTotals(spaceSafety);
  const hasFireAlarmEvidence =
    totals.smoke_detectors > 0 ||
    totals.heat_detectors > 0 ||
    totals.fire_alarm_panels > 0 ||
    totals.alarm_bells > 0;
  const hasSprinklerEvidence =
    totals.sprinklers > 0 ||
    spaceSafety.floors.some((floor) =>
      floor.areas.some((area) => (area.suppression_approved ?? area.suppression_suggested).includes('رش آلي'))
    );
  const hazardLabels = [...new Set(
    spaceSafety.floors.flatMap((floor) =>
      floor.areas.map((area) => hazardClassificationLabel(area.hazard_approved || area.hazard_suggested))
    )
  )];
  const quantityParts = [
    `الشاغلون التقديريون: ${totals.estimated_occupants}`,
    `المرشات: ${totals.sprinklers}`,
    `كواشف الدخان: ${totals.smoke_detectors}`,
    `كواشف الحرارة: ${totals.heat_detectors}`,
    `لوحات الإنذار: ${totals.fire_alarm_panels}`,
    `الطفايات اليدوية: ${totals.manual_extinguishers}`,
  ];

  return {
    hasSource: true,
    estimatedOccupants: totals.estimated_occupants,
    exitsCount: totals.emergency_exits,
    stairsCount: totals.emergency_stairs,
    // Absence of equipment is not evidence of a negative compliance decision.
    fireAlarmSystem: hasFireAlarmEvidence ? 'نعم' : '',
    sprinklerSystem: hasSprinklerEvidence ? 'نعم' : '',
    hazardSummary: hazardLabels.length ? `تصنيفات الخطورة المسجلة للمساحات: ${hazardLabels.join(' · ')}` : null,
    quantitiesSummary: quantityParts.join(' · '),
  };
}

/** Apply derived values only to fields that the engineer left empty. */
export function resolveBuildingPlanWithSpaceSafety(
  report: BuildingPlanReport,
  derived: DerivedPlanInfoFromSpaceSafety
): BuildingPlanReportWithSpaceSafety {
  if (!derived.hasSource) return report;
  return {
    ...report,
    exits_count: report.exits_count || (derived.exitsCount === null ? undefined : String(derived.exitsCount)),
    stairs_count: report.stairs_count || (derived.stairsCount === null ? undefined : String(derived.stairsCount)),
    fire_alarm_system: report.fire_alarm_system || derived.fireAlarmSystem,
    sprinkler_system: report.sprinkler_system || derived.sprinklerSystem,
    sbc_requirements: report.sbc_requirements || derived.hazardSummary || undefined,
    derived_space_safety_occupants:
      derived.estimatedOccupants === null ? undefined : String(derived.estimatedOccupants),
    derived_space_safety_quantities: derived.quantitiesSummary || undefined,
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
    manual_city: report.manual_city,
    manual_district: report.manual_district,
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
    electrical_rooms_count: report.electrical_rooms_count ?? null,
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
