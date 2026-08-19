import type { ClientRecord } from '@/lib/types/client';
import type {
  BuildingPlanReport,
  ProjectEngineeringData,
  TechnicalReport,
  TechnicalReportSourceOverride,
  TechnicalReportSourceOverrideValue,
  TechnicalReportZone,
} from '@/lib/types/project-reports';
import type {
  DesignCenterState,
  DesignSpaceSafetyArea,
  DesignSpaceSafetyFloor,
  DesignSpaceSafetyQuantities,
  DesignSpaceSafetySuggestionOverrides,
} from '@/lib/projects/design-center/types';

/**
 * Phase 1 technical-report source bridge.
 *
 * This module is intentionally pure and centralised: it never writes to Sales,
 * Plan Information, Design Center, Space Safety, or the live payload. It builds
 * an on-read, normalized view that future UI/PDF layers can consume consistently.
 */

export type TechnicalReportFieldClassification =
  | 'AUTO_FILL_LOCKED'
  | 'AUTO_FILL_EDITABLE'
  | 'AUTO_SUGGEST'
  | 'MANUAL';

export type TechnicalReportSourceStage =
  | 'technical_report_override'
  | 'design_center_approved'
  | 'space_safety'
  | 'plan_information'
  | 'basic_data'
  | 'legacy_technical_report'
  | 'derived'
  | 'missing';

export type TechnicalReportSourceStatus =
  | 'engineer_override'
  | 'approved_upstream'
  | 'inherited'
  | 'derived'
  | 'legacy'
  | 'missing';

export type TechnicalReportBridgeValue = string | number | boolean | null;

export type TechnicalReportSourceField<T extends TechnicalReportBridgeValue = TechnicalReportBridgeValue> = {
  /** Final value consumed by UI/PDF. `0` is an intentional value, never missing. */
  value: T;
  /** Same as value, exposed for explicit Source → Auto → Override → Final flows. */
  final_value: T;
  /** Best available upstream value before applying an engineer override. */
  auto_value: T;
  source: TechnicalReportSourceStage;
  source_stage: TechnicalReportSourceStage;
  source_key: string | null;
  status: TechnicalReportSourceStatus;
  classification: TechnicalReportFieldClassification;
  engineer_override: boolean;
};

export type TechnicalReportSourceQuantities = {
  sprinklers: TechnicalReportSourceField<number | null>;
  smoke_detectors: TechnicalReportSourceField<number | null>;
  heat_detectors: TechnicalReportSourceField<number | null>;
  fire_alarm_panels: TechnicalReportSourceField<number | null>;
  alarm_panel_locations: TechnicalReportSourceField<string | null>;
  signs: TechnicalReportSourceField<number | null>;
  emergency_lights: TechnicalReportSourceField<number | null>;
  emergency_exits: TechnicalReportSourceField<number | null>;
  alarm_bells: TechnicalReportSourceField<number | null>;
  emergency_stairs: TechnicalReportSourceField<number | null>;
  manual_extinguishers: TechnicalReportSourceField<number | null>;
  manual_extinguisher_type: TechnicalReportSourceField<string | null>;
  manual_extinguisher_size: TechnicalReportSourceField<string | null>;
};

export type TechnicalReportSourceSpace = {
  id: string;
  source_usage_id: string | null;
  name: TechnicalReportSourceField<string | null>;
  activity_use: TechnicalReportSourceField<string | null>;
  area_m2: TechnicalReportSourceField<number | null>;
  occupancy: TechnicalReportSourceField<string | null>;
  hazard_classification: TechnicalReportSourceField<string | null>;
  occupants: TechnicalReportSourceField<number | null>;
  exits: TechnicalReportSourceField<number | null>;
  travel_distance_m: TechnicalReportSourceField<number | null>;
  quantities: TechnicalReportSourceQuantities;
  suggestion_overrides: DesignSpaceSafetySuggestionOverrides | null;
};

export type TechnicalReportSourceFloor = {
  id: string;
  name: TechnicalReportSourceField<string | null>;
  base_area_m2: TechnicalReportSourceField<number | null>;
  /** Repetition remains explicit so aggregate math applies it exactly once. */
  repeat_count: TechnicalReportSourceField<number | null>;
  total_area_m2: TechnicalReportSourceField<number | null>;
  occupants: TechnicalReportSourceField<number | null>;
  exits: TechnicalReportSourceField<number | null>;
  travel_distance_m: TechnicalReportSourceField<number | null>;
  spaces: TechnicalReportSourceSpace[];
};

export type TechnicalReportSourceAggregates = {
  total_floor_area_m2: TechnicalReportSourceField<number | null>;
  total_occupants: TechnicalReportSourceField<number | null>;
  total_exits: TechnicalReportSourceField<number | null>;
  maximum_travel_distance_m: TechnicalReportSourceField<number | null>;
  total_sprinklers: TechnicalReportSourceField<number | null>;
  total_smoke_detectors: TechnicalReportSourceField<number | null>;
  total_heat_detectors: TechnicalReportSourceField<number | null>;
  total_emergency_lights: TechnicalReportSourceField<number | null>;
  total_signs: TechnicalReportSourceField<number | null>;
  total_alarm_devices: TechnicalReportSourceField<number | null>;
  total_extinguishers: TechnicalReportSourceField<number | null>;
};

export type TechnicalReportSourceProject = {
  project_name: TechnicalReportSourceField<string | null>;
  owner_name: TechnicalReportSourceField<string | null>;
  activity: TechnicalReportSourceField<string | null>;
  city: TechnicalReportSourceField<string | null>;
  district: TechnicalReportSourceField<string | null>;
  street: TechnicalReportSourceField<string | null>;
  national_address: TechnicalReportSourceField<string | null>;
  plot_number: TechnicalReportSourceField<string | null>;
  building_permit_number: TechnicalReportSourceField<string | null>;
  building_permit_date: TechnicalReportSourceField<string | null>;
  land_area_m2: TechnicalReportSourceField<number | null>;
  building_area_m2: TechnicalReportSourceField<number | null>;
  floors_count: TechnicalReportSourceField<number | null>;
  building_status: TechnicalReportSourceField<string | null>;
};

export type TechnicalReportSourcePlan = {
  occupancy_classification: TechnicalReportSourceField<string | null>;
  construction_type: TechnicalReportSourceField<string | null>;
  floors_description: TechnicalReportSourceField<string | null>;
  building_height_m: TechnicalReportSourceField<string | null>;
  basement_floors_count: TechnicalReportSourceField<string | null>;
  underground_depth_m: TechnicalReportSourceField<string | null>;
  high_rise_building: TechnicalReportSourceField<string | null>;
  atrium_exists: TechnicalReportSourceField<string | null>;
  windowless_building: TechnicalReportSourceField<string | null>;
  exits_count: TechnicalReportSourceField<string | null>;
  stairs_count: TechnicalReportSourceField<string | null>;
  electrical_grounding: TechnicalReportSourceField<string | null>;
  lightning_protection: TechnicalReportSourceField<string | null>;
  backup_generator: TechnicalReportSourceField<string | null>;
  fire_alarm_system: TechnicalReportSourceField<string | null>;
  sprinkler_system: TechnicalReportSourceField<string |null>;
  civil_defense_branch: TechnicalReportSourceField<string | null>;
  special_rescue_team_required: TechnicalReportSourceField<string | null>;
};

export type TechnicalReportSourceData = {
  version: 1;
  project: TechnicalReportSourceProject;
  plan: TechnicalReportSourcePlan;
  floors: TechnicalReportSourceFloor[];
  aggregates: TechnicalReportSourceAggregates;
  /** Field-specific deterministic precedence, emitted for UI/PDF/tests. */
  precedence: Record<string, readonly TechnicalReportSourceStage[]>;
};

type Candidate<T extends TechnicalReportBridgeValue> = {
  value: T;
  source_stage: Exclude<TechnicalReportSourceStage, 'technical_report_override' | 'derived' | 'missing'>;
  source_key: string;
  status: Exclude<TechnicalReportSourceStatus, 'engineer_override' | 'derived' | 'missing'>;
};

type BuildParams = {
  client: ClientRecord;
  engineeringData: Pick<
    ProjectEngineeringData,
    'technical_report' | 'building_plan' | 'design_center' | 'workflow'
  >;
};

const FIELD_PRECEDENCE: Record<string, readonly TechnicalReportSourceStage[]> = {
  project_name: ['technical_report_override', 'basic_data', 'legacy_technical_report', 'missing'],
  owner_name: ['technical_report_override', 'basic_data', 'missing'],
  activity: ['technical_report_override', 'basic_data', 'missing'],
  city: ['technical_report_override', 'basic_data', 'missing'],
  district: ['technical_report_override', 'basic_data', 'missing'],
  street: ['technical_report_override', 'basic_data', 'missing'],
  national_address: ['technical_report_override', 'basic_data', 'missing'],
  plot_number: ['technical_report_override', 'basic_data', 'missing'],
  building_permit_number: [
    'technical_report_override',
    'plan_information',
    'legacy_technical_report',
    'basic_data',
    'missing',
  ],
  building_permit_date: ['technical_report_override', 'plan_information', 'legacy_technical_report', 'missing'],
  land_area_m2: ['technical_report_override', 'basic_data', 'plan_information', 'missing'],
  building_area_m2: ['technical_report_override', 'basic_data', 'missing'],
  floors_count: ['technical_report_override', 'plan_information', 'basic_data', 'missing'],
  building_status: ['technical_report_override', 'legacy_technical_report', 'basic_data', 'missing'],
  occupancy_classification: [
    'technical_report_override',
    'design_center_approved',
    'plan_information',
    'legacy_technical_report',
    'missing',
  ],
  construction_type: ['technical_report_override', 'plan_information', 'missing'],
  plan_information: ['technical_report_override', 'plan_information', 'missing'],
  space_safety: ['technical_report_override', 'design_center_approved', 'space_safety', 'legacy_technical_report', 'missing'],
};

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function readQuantity(
  quantities: DesignSpaceSafetyQuantities | null | undefined,
  key: keyof DesignSpaceSafetyQuantities
): number | string | null {
  const raw = quantities as unknown as Record<string, unknown> | null | undefined;
  if (!raw || !Object.prototype.hasOwnProperty.call(raw, key)) return null;
  const value = raw[key];
  if (key === 'manual_extinguisher_type' || key === 'manual_extinguisher_size') {
    return asNullableString(value);
  }
  if (key === 'alarm_panel_locations') {
    return Array.isArray(value) ? value.map(String).filter(Boolean).join('، ') || null : null;
  }
  return asNullableNumber(value);
}

function overrideFor(
  report: TechnicalReport,
  fieldKey: string
): TechnicalReportSourceOverride | null {
  return report.source_overrides?.[fieldKey] || null;
}

function makeField<T extends TechnicalReportBridgeValue>(params: {
  report: TechnicalReport;
  fieldKey: string;
  classification: TechnicalReportFieldClassification;
  candidates: Candidate<T>[];
}): TechnicalReportSourceField<T> {
  const manual = overrideFor(params.report, params.fieldKey);
  if (manual) {
    const value = manual.value as T;
    const auto = params.candidates.find((candidate) => isPresent(candidate.value))?.value ?? null;
    return {
      value,
      final_value: value,
      auto_value: auto as T,
      source: 'technical_report_override',
      source_stage: 'technical_report_override',
      source_key: `technical_report.source_overrides.${params.fieldKey}`,
      status: 'engineer_override',
      classification: params.classification,
      engineer_override: true,
    };
  }

  const candidate = params.candidates.find((item) => isPresent(item.value));
  if (!candidate) {
    return {
      value: null as T,
      final_value: null as T,
      auto_value: null as T,
      source: 'missing',
      source_stage: 'missing',
      source_key: null,
      status: 'missing',
      classification: params.classification,
      engineer_override: false,
    };
  }

  return {
    value: candidate.value,
    final_value: candidate.value,
    auto_value: candidate.value,
    source: candidate.source_stage,
    source_stage: candidate.source_stage,
    source_key: candidate.source_key,
    status: candidate.status,
    classification: params.classification,
    engineer_override: false,
  };
}

function makeDerivedField<T extends number | null>(
  fieldKey: string,
  value: T
): TechnicalReportSourceField<T> {
  if (value === null) {
    return {
      value,
      final_value: value,
      auto_value: value,
      source: 'missing',
      source_stage: 'missing',
      source_key: null,
      status: 'missing',
      classification: 'AUTO_SUGGEST',
      engineer_override: false,
    };
  }
  return {
    value,
    final_value: value,
    auto_value: value,
    source: 'derived',
    source_stage: 'derived',
    source_key: fieldKey,
    status: 'derived',
    classification: 'AUTO_SUGGEST',
    engineer_override: false,
  };
}

function designCenterSpaceSafetyStage(designCenter: DesignCenterState): {
  source_stage: 'design_center_approved' | 'space_safety';
  status: 'approved_upstream' | 'inherited';
} {
  const approved = designCenter.status === 'معتمد';
  return approved
    ? { source_stage: 'design_center_approved', status: 'approved_upstream' }
    : { source_stage: 'space_safety', status: 'inherited' };
}

function zoneIndex(report: TechnicalReport): Map<string, TechnicalReportZone> {
  const indexed = new Map<string, TechnicalReportZone>();
  for (const floor of report.floor_uses || []) {
    for (const zone of floor.zones || []) {
      indexed.set(zone.id, zone);
    }
  }
  return indexed;
}

function floorArea(floor: DesignSpaceSafetyFloor): number | null {
  if (!floor.areas.length) return null;
  return floor.areas.reduce((sum, area) => sum + (asNullableNumber(area.area_m2) ?? 0), 0);
}

function floorOccupants(floor: DesignSpaceSafetyFloor): number | null {
  const direct = asNullableNumber(floor.estimated_occupants);
  if (direct !== null) return direct;
  const values = floor.areas
    .map((area) => asNullableNumber(area.estimated_occupants))
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function floorExits(floor: DesignSpaceSafetyFloor): number | null {
  const values = floor.areas
    .map((area) => readQuantity(area.quantities, 'emergency_exits'))
    .map(asNullableNumber)
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function floorTravelDistance(floor: DesignSpaceSafetyFloor): number | null {
  const direct = asNullableNumber(floor.max_travel_distance_m);
  if (direct !== null) return direct;
  const values = floor.areas
    .map((area) => asNullableNumber(area.max_travel_distance_m))
    .filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

function spaceSafetyKeyFromBridgeField(fieldKey: string, fallbackKey?: string): string {
  const path = fieldKey.replace(
    /^floors\.([^.]+)\.spaces\.([^.]+)\./,
    'design_center.space_safety.floors.$1.areas.$2.'
  );
  return fallbackKey ? `${path}.${fallbackKey}` : path;
}

function quantityField(
  report: TechnicalReport,
  fieldKey: string,
  source: { source_stage: 'design_center_approved' | 'space_safety'; status: 'approved_upstream' | 'inherited' },
  rawValue: number | string | null,
  sourceKey?: string
): TechnicalReportSourceField<number | null> | TechnicalReportSourceField<string | null> {
  const numeric = asNullableNumber(rawValue);
  const isNumeric = typeof rawValue === 'number' || typeof rawValue === 'string' && rawValue.trim() !== '' && Number.isFinite(Number(rawValue));
  if (isNumeric) {
    return makeField<number | null>({
      report,
      fieldKey,
      classification: 'AUTO_SUGGEST',
      candidates: numeric === null ? [] : [{ value: numeric, source_key: sourceKey || spaceSafetyKeyFromBridgeField(fieldKey), ...source }],
    });
  }
  return makeField<string | null>({
    report,
    fieldKey,
    classification: 'AUTO_SUGGEST',
    candidates: typeof rawValue === 'string' && rawValue.trim()
      ? [{ value: rawValue, source_key: sourceKey || spaceSafetyKeyFromBridgeField(fieldKey), ...source }]
      : [],
  });
}

function makeQuantities(params: {
  report: TechnicalReport;
  prefix: string;
  area: DesignSpaceSafetyArea;
  source: { source_stage: 'design_center_approved' | 'space_safety'; status: 'approved_upstream' | 'inherited' };
}): TechnicalReportSourceQuantities {
  const field = (key: keyof DesignSpaceSafetyQuantities) =>
    quantityField(params.report, `${params.prefix}.quantities.${key}`, params.source, readQuantity(params.area.quantities, key));

  return {
    sprinklers: field('sprinklers') as TechnicalReportSourceField<number | null>,
    smoke_detectors: field('smoke_detectors') as TechnicalReportSourceField<number | null>,
    heat_detectors: field('heat_detectors') as TechnicalReportSourceField<number | null>,
    fire_alarm_panels: field('fire_alarm_panels') as TechnicalReportSourceField<number | null>,
    alarm_panel_locations: field('alarm_panel_locations') as TechnicalReportSourceField<string | null>,
    signs: field('signs') as TechnicalReportSourceField<number | null>,
    emergency_lights: field('emergency_lights') as TechnicalReportSourceField<number | null>,
    emergency_exits: field('emergency_exits') as TechnicalReportSourceField<number | null>,
    alarm_bells: field('alarm_bells') as TechnicalReportSourceField<number | null>,
    emergency_stairs: field('emergency_stairs') as TechnicalReportSourceField<number | null>,
    manual_extinguishers: field('manual_extinguishers') as TechnicalReportSourceField<number | null>,
    manual_extinguisher_type: field('manual_extinguisher_type') as TechnicalReportSourceField<string | null>,
    manual_extinguisher_size: field('manual_extinguisher_size') as TechnicalReportSourceField<string | null>,
  };
}

function buildSpaceSafetyFloors(params: {
  report: TechnicalReport;
  designCenter: DesignCenterState;
}): TechnicalReportSourceFloor[] {
  const copy = params.designCenter.space_safety;
  if (!copy?.floors.length) return [];
  const zoneById = zoneIndex(params.report);
  const source = designCenterSpaceSafetyStage(params.designCenter);

  return copy.floors.map((floor) => {
    const prefix = `floors.${floor.id}`;
    const baseArea = floorArea(floor);
    const repeatCount = Math.max(1, asNullableNumber(floor.repeat_count) ?? 1);
    const spaces = floor.areas.map((area) => {
      const spacePrefix = `${prefix}.spaces.${area.id}`;
      const legacyZone = zoneById.get(area.source_usage_id || area.id);
      const approvedHazard = asNullableString(area.hazard_approved);
      const suggestedHazard = asNullableString(area.hazard_suggested);
      const occupancy = asNullableString(legacyZone?.occupancy_code);
      const activity = asNullableString(area.activity_type) || asNullableString(legacyZone?.use_code);
      return {
        id: area.id,
        source_usage_id: area.source_usage_id || null,
        name: makeField<string | null>({
          report: params.report,
          fieldKey: `${spacePrefix}.name`,
          classification: 'AUTO_FILL_EDITABLE',
          candidates: [{ value: asNullableString(area.label), source_key: `${prefix}.areas.${area.id}.label`, ...source }],
        }),
        activity_use: makeField<string | null>({
          report: params.report,
          fieldKey: `${spacePrefix}.activity_use`,
          classification: 'AUTO_FILL_EDITABLE',
          candidates: [{ value: activity, source_key: `${prefix}.areas.${area.id}.activity_type`, ...source }],
        }),
        area_m2: makeField<number | null>({
          report: params.report,
          fieldKey: `${spacePrefix}.area_m2`,
          classification: 'AUTO_FILL_EDITABLE',
          candidates: [{ value: asNullableNumber(area.area_m2), source_key: `${prefix}.areas.${area.id}.area_m2`, ...source }],
        }),
        occupancy: makeField<string | null>({
          report: params.report,
          fieldKey: `${spacePrefix}.occupancy`,
          classification: 'AUTO_FILL_EDITABLE',
          candidates: occupancy ? [{ value: occupancy, source_key: `technical_report.floor_uses.zones.${legacyZone?.id}.occupancy_code`, status: 'legacy', source_stage: 'legacy_technical_report' }] : [],
        }),
        hazard_classification: makeField<string | null>({
          report: params.report,
          fieldKey: `${spacePrefix}.hazard_classification`,
          classification: 'AUTO_FILL_EDITABLE',
          candidates: [
            { value: approvedHazard, source_key: `${prefix}.areas.${area.id}.hazard_approved`, ...source },
            { value: suggestedHazard, source_key: `${prefix}.areas.${area.id}.hazard_suggested`, ...source },
          ],
        }),
        occupants: makeField<number | null>({
          report: params.report,
          fieldKey: `${spacePrefix}.occupants`,
          classification: 'AUTO_SUGGEST',
          candidates: [{ value: asNullableNumber(area.estimated_occupants), source_key: `${prefix}.areas.${area.id}.estimated_occupants`, ...source }],
        }),
        exits: quantityField(params.report, `${spacePrefix}.exits`, source, readQuantity(area.quantities, 'emergency_exits'), spaceSafetyKeyFromBridgeField(`${spacePrefix}.quantities.emergency_exits`)) as TechnicalReportSourceField<number | null>,
        travel_distance_m: makeField<number | null>({
          report: params.report,
          fieldKey: `${spacePrefix}.travel_distance_m`,
          classification: 'AUTO_SUGGEST',
          candidates: [{ value: asNullableNumber(area.max_travel_distance_m), source_key: `${prefix}.areas.${area.id}.max_travel_distance_m`, ...source }],
        }),
        quantities: makeQuantities({ report: params.report, prefix: spacePrefix, area, source }),
        suggestion_overrides: area.suggestion_overrides || null,
      };
    });

    return {
      id: floor.id,
      name: makeField<string | null>({
        report: params.report,
        fieldKey: `${prefix}.name`,
        classification: 'AUTO_FILL_EDITABLE',
        candidates: [{ value: asNullableString(floor.label), source_key: `${prefix}.label`, ...source }],
      }),
      base_area_m2: makeField<number | null>({
        report: params.report,
        fieldKey: `${prefix}.base_area_m2`,
        classification: 'AUTO_FILL_EDITABLE',
        candidates: [{ value: baseArea, source_key: `${prefix}.areas[].area_m2`, ...source }],
      }),
      repeat_count: makeField<number | null>({
        report: params.report,
        fieldKey: `${prefix}.repeat_count`,
        classification: 'AUTO_FILL_EDITABLE',
        candidates: [{ value: repeatCount, source_key: `${prefix}.repeat_count`, ...source }],
      }),
      total_area_m2: makeDerivedField(`${prefix}.total_area_m2`, baseArea === null ? null : baseArea * repeatCount),
      occupants: makeField<number | null>({
        report: params.report,
        fieldKey: `${prefix}.occupants`,
        classification: 'AUTO_SUGGEST',
        candidates: [{ value: floorOccupants(floor), source_key: `${prefix}.estimated_occupants`, ...source }],
      }),
      exits: makeField<number | null>({
        report: params.report,
        fieldKey: `${prefix}.exits`,
        classification: 'AUTO_SUGGEST',
        candidates: [{ value: floorExits(floor), source_key: `${prefix}.areas[].quantities.emergency_exits`, ...source }],
      }),
      travel_distance_m: makeField<number | null>({
        report: params.report,
        fieldKey: `${prefix}.travel_distance_m`,
        classification: 'AUTO_SUGGEST',
        candidates: [{ value: floorTravelDistance(floor), source_key: `${prefix}.max_travel_distance_m`, ...source }],
      }),
      spaces,
    };
  });
}

function buildLegacyFloors(report: TechnicalReport): TechnicalReportSourceFloor[] {
  return (report.floor_uses || []).map((floor) => {
    const prefix = `floors.${floor.id}`;
    const source: Candidate<string | null>['source_stage'] = 'legacy_technical_report';
    const spaces = (floor.zones || []).map((zone) => legacyZoneToSpace(report, floor.id, zone));
    const baseArea = asNullableNumber(floor.floor_area_m2);
    return {
      id: floor.id,
      name: makeField({ report, fieldKey: `${prefix}.name`, classification: 'AUTO_FILL_EDITABLE', candidates: [{ value: asNullableString(floor.floor_name), source_stage: source, source_key: `technical_report.floor_uses.${floor.id}.floor_name`, status: 'legacy' }] }),
      base_area_m2: makeField({ report, fieldKey: `${prefix}.base_area_m2`, classification: 'AUTO_FILL_EDITABLE', candidates: [{ value: baseArea, source_stage: source, source_key: `technical_report.floor_uses.${floor.id}.floor_area_m2`, status: 'legacy' }] }),
      repeat_count: makeField({ report, fieldKey: `${prefix}.repeat_count`, classification: 'AUTO_FILL_EDITABLE', candidates: [{ value: 1, source_stage: source, source_key: `technical_report.floor_uses.${floor.id}`, status: 'legacy' }] }),
      total_area_m2: makeDerivedField(`${prefix}.total_area_m2`, baseArea),
      occupants: makeField({ report, fieldKey: `${prefix}.occupants`, classification: 'AUTO_SUGGEST', candidates: [] }),
      exits: makeField({ report, fieldKey: `${prefix}.exits`, classification: 'AUTO_SUGGEST', candidates: [] }),
      travel_distance_m: makeField({ report, fieldKey: `${prefix}.travel_distance_m`, classification: 'AUTO_SUGGEST', candidates: [] }),
      spaces,
    };
  });
}

function legacyZoneToSpace(report: TechnicalReport, floorId: string, zone: TechnicalReportZone): TechnicalReportSourceSpace {
  const prefix = `floors.${floorId}.spaces.${zone.id}`;
  const legacy = <T extends TechnicalReportBridgeValue>(fieldKey: string, value: T, classification: TechnicalReportFieldClassification) =>
    makeField<T>({
      report,
      fieldKey,
      classification,
      candidates: [{ value, source_stage: 'legacy_technical_report', source_key: `technical_report.floor_uses.${floorId}.zones.${zone.id}`, status: 'legacy' }],
    });
  const quantity = (key: keyof TechnicalReportSourceQuantities) =>
    legacy(`${prefix}.quantities.${key}`, null, 'AUTO_SUGGEST') as TechnicalReportSourceField<number | null>;

  return {
    id: zone.id,
    source_usage_id: null,
    name: legacy(`${prefix}.name`, asNullableString(zone.label), 'AUTO_FILL_EDITABLE'),
    activity_use: legacy(`${prefix}.activity_use`, asNullableString(zone.use_code), 'AUTO_FILL_EDITABLE'),
    area_m2: legacy(`${prefix}.area_m2`, asNullableNumber(zone.area_m2), 'AUTO_FILL_EDITABLE'),
    occupancy: legacy(`${prefix}.occupancy`, asNullableString(zone.occupancy_code), 'AUTO_FILL_EDITABLE'),
    hazard_classification: legacy(`${prefix}.hazard_classification`, asNullableString(zone.risk_label || zone.risk_level), 'AUTO_FILL_EDITABLE'),
    occupants: legacy(`${prefix}.occupants`, null, 'AUTO_SUGGEST') as TechnicalReportSourceField<number | null>,
    exits: legacy(`${prefix}.exits`, null, 'AUTO_SUGGEST') as TechnicalReportSourceField<number | null>,
    travel_distance_m: legacy(`${prefix}.travel_distance_m`, null, 'AUTO_SUGGEST') as TechnicalReportSourceField<number | null>,
    quantities: {
      sprinklers: quantity('sprinklers'),
      smoke_detectors: quantity('smoke_detectors'),
      heat_detectors: quantity('heat_detectors'),
      fire_alarm_panels: quantity('fire_alarm_panels'),
      alarm_panel_locations: legacy(`${prefix}.quantities.alarm_panel_locations`, null, 'AUTO_SUGGEST') as TechnicalReportSourceField<string | null>,
      signs: quantity('signs'),
      emergency_lights: quantity('emergency_lights'),
      emergency_exits: quantity('emergency_exits'),
      alarm_bells: quantity('alarm_bells'),
      emergency_stairs: quantity('emergency_stairs'),
      manual_extinguishers: quantity('manual_extinguishers'),
      manual_extinguisher_type: legacy(`${prefix}.quantities.manual_extinguisher_type`, null, 'AUTO_SUGGEST') as TechnicalReportSourceField<string | null>,
      manual_extinguisher_size: legacy(`${prefix}.quantities.manual_extinguisher_size`, null, 'AUTO_SUGGEST') as TechnicalReportSourceField<string | null>,
    },
    suggestion_overrides: null,
  };
}

function aggregateSum(
  floors: TechnicalReportSourceFloor[],
  selector: (floor: TechnicalReportSourceFloor) => number | null
): number | null {
  const values = floors
    .map((floor) => selector(floor))
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function aggregateQuantities(
  floors: TechnicalReportSourceFloor[],
  selector: (space: TechnicalReportSourceSpace) => number | null
): number | null {
  const values: number[] = [];
  for (const floor of floors) {
    const repeat = floor.repeat_count.value ?? 1;
    for (const space of floor.spaces) {
      const value = selector(space);
      if (value !== null) values.push(value * repeat);
    }
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function buildAggregates(floors: TechnicalReportSourceFloor[]): TechnicalReportSourceAggregates {
  const maxTravelValues = floors
    .map((floor) => floor.travel_distance_m.value)
    .filter((value): value is number => value !== null);
  return {
    total_floor_area_m2: makeDerivedField('aggregates.total_floor_area_m2', aggregateSum(floors, (floor) => floor.total_area_m2.value)),
    total_occupants: makeDerivedField('aggregates.total_occupants', aggregateSum(floors, (floor) => {
      const value = floor.occupants.value;
      const repeat = floor.repeat_count.value ?? 1;
      return value === null ? null : value * repeat;
    })),
    total_exits: makeDerivedField('aggregates.total_exits', aggregateSum(floors, (floor) => {
      const value = floor.exits.value;
      const repeat = floor.repeat_count.value ?? 1;
      return value === null ? null : value * repeat;
    })),
    maximum_travel_distance_m: makeDerivedField('aggregates.maximum_travel_distance_m', maxTravelValues.length ? Math.max(...maxTravelValues) : null),
    total_sprinklers: makeDerivedField('aggregates.total_sprinklers', aggregateQuantities(floors, (space) => space.quantities.sprinklers.value)),
    total_smoke_detectors: makeDerivedField('aggregates.total_smoke_detectors', aggregateQuantities(floors, (space) => space.quantities.smoke_detectors.value)),
    total_heat_detectors: makeDerivedField('aggregates.total_heat_detectors', aggregateQuantities(floors, (space) => space.quantities.heat_detectors.value)),
    total_emergency_lights: makeDerivedField('aggregates.total_emergency_lights', aggregateQuantities(floors, (space) => space.quantities.emergency_lights.value)),
    total_signs: makeDerivedField('aggregates.total_signs', aggregateQuantities(floors, (space) => space.quantities.signs.value)),
    total_alarm_devices: makeDerivedField('aggregates.total_alarm_devices', aggregateQuantities(floors, (space) => {
      const bells = space.quantities.alarm_bells.value;
      const panels = space.quantities.fire_alarm_panels.value;
      if (bells === null && panels === null) return null;
      return (bells || 0) + (panels || 0);
    })),
    total_extinguishers: makeDerivedField('aggregates.total_extinguishers', aggregateQuantities(floors, (space) => space.quantities.manual_extinguishers.value)),
  };
}

function planField(
  report: TechnicalReport,
  fieldKey: string,
  planKey: keyof BuildingPlanReport,
  plan: BuildingPlanReport,
  classification: TechnicalReportFieldClassification = 'AUTO_FILL_LOCKED'
): TechnicalReportSourceField<string | null> {
  const rawValue = plan[planKey];
  return makeField({
    report,
    fieldKey,
    classification,
    candidates: typeof rawValue === 'string'
      ? [{ value: asNullableString(rawValue), source_stage: 'plan_information', source_key: `building_plan.${String(planKey)}`, status: 'inherited' }]
      : [],
  });
}

function buildProject(params: BuildParams): TechnicalReportSourceProject {
  const { client, engineeringData } = params;
  const report = engineeringData.technical_report;
  const plan = engineeringData.building_plan;
  const basic = <T extends TechnicalReportBridgeValue>(fieldKey: string, value: T, classification: TechnicalReportFieldClassification, extras: Candidate<T>[] = []) =>
    makeField<T>({
      report,
      fieldKey,
      classification,
      candidates: [{ value, source_stage: 'basic_data', source_key: `client.${fieldKey}`, status: 'inherited' }, ...extras],
    });

  return {
    project_name: basic('project.project_name', asNullableString(client.business_name || client.name), 'AUTO_FILL_LOCKED'),
    owner_name: basic('project.owner_name', asNullableString(client.owner_name), 'AUTO_FILL_LOCKED'),
    activity: basic('project.activity', asNullableString(client.activity_type), 'AUTO_FILL_LOCKED'),
    city: basic('project.city', asNullableString(client.city), 'AUTO_FILL_LOCKED'),
    district: basic('project.district', asNullableString(client.district), 'AUTO_FILL_LOCKED'),
    street: basic('project.street', asNullableString(client.street), 'AUTO_FILL_LOCKED'),
    national_address: basic('project.national_address', asNullableString(client.national_address), 'AUTO_FILL_LOCKED'),
    plot_number: basic('project.plot_number', asNullableString(client.plot_number), 'AUTO_FILL_LOCKED'),
    building_permit_number: makeField({
      report,
      fieldKey: 'project.building_permit_number',
      classification: 'AUTO_FILL_LOCKED',
      candidates: [
        { value: asNullableString(plan.building_permit_number), source_stage: 'plan_information', source_key: 'building_plan.building_permit_number', status: 'inherited' },
        { value: asNullableString(report.building_permit_number), source_stage: 'legacy_technical_report', source_key: 'technical_report.building_permit_number', status: 'legacy' },
        { value: asNullableString(client.license_number), source_stage: 'basic_data', source_key: 'client.license_number', status: 'inherited' },
      ],
    }),
    building_permit_date: makeField({
      report,
      fieldKey: 'project.building_permit_date',
      classification: 'AUTO_FILL_LOCKED',
      candidates: [
        { value: asNullableString(plan.building_permit_date), source_stage: 'plan_information', source_key: 'building_plan.building_permit_date', status: 'inherited' },
        { value: asNullableString(report.building_permit_date), source_stage: 'legacy_technical_report', source_key: 'technical_report.building_permit_date', status: 'legacy' },
      ],
    }),
    land_area_m2: basic('project.land_area_m2', asNullableNumber(client.land_area), 'AUTO_FILL_LOCKED', [{ value: asNullableNumber(plan.total_site_area_m2), source_stage: 'plan_information', source_key: 'building_plan.total_site_area_m2', status: 'inherited' }]),
    building_area_m2: basic('project.building_area_m2', asNullableNumber(client.building_area), 'AUTO_FILL_LOCKED'),
    floors_count: makeField({
      report,
      fieldKey: 'project.floors_count',
      classification: 'AUTO_FILL_LOCKED',
      candidates: [
        { value: asNullableNumber(plan.licensed_floor_count), source_stage: 'plan_information', source_key: 'building_plan.licensed_floor_count', status: 'inherited' },
        { value: asNullableNumber(client.floors_count), source_stage: 'basic_data', source_key: 'client.floors_count', status: 'inherited' },
      ],
    }),
    building_status: makeField({
      report,
      fieldKey: 'project.building_status',
      classification: 'AUTO_FILL_EDITABLE',
      candidates: [
        { value: asNullableString(report.building_status), source_stage: 'legacy_technical_report', source_key: 'technical_report.building_status', status: 'legacy' },
        { value: asNullableString(client.project_status), source_stage: 'basic_data', source_key: 'client.project_status', status: 'inherited' },
      ],
    }),
  };
}

function buildPlan(report: TechnicalReport, plan: BuildingPlanReport): TechnicalReportSourcePlan {
  return {
    occupancy_classification: makeField({
      report,
      fieldKey: 'plan.occupancy_classification',
      classification: 'AUTO_FILL_EDITABLE',
      candidates: [
        { value: asNullableString(plan.occupancy_classification), source_stage: 'plan_information', source_key: 'building_plan.occupancy_classification', status: 'inherited' },
        { value: asNullableString(report.building_classification), source_stage: 'legacy_technical_report', source_key: 'technical_report.building_classification', status: 'legacy' },
      ],
    }),
    construction_type: planField(report, 'plan.construction_type', 'building_type_code', plan),
    floors_description: planField(report, 'plan.floors_description', 'floors_description', plan),
    building_height_m: planField(report, 'plan.building_height_m', 'building_height_m', plan),
    basement_floors_count: planField(report, 'plan.basement_floors_count', 'basement_floors_count', plan),
    underground_depth_m: planField(report, 'plan.underground_depth_m', 'underground_depth_m', plan),
    high_rise_building: planField(report, 'plan.high_rise_building', 'high_rise_building', plan),
    atrium_exists: planField(report, 'plan.atrium_exists', 'atrium_exists', plan),
    windowless_building: planField(report, 'plan.windowless_building', 'windowless_building', plan),
    exits_count: planField(report, 'plan.exits_count', 'exits_count', plan, 'AUTO_FILL_EDITABLE'),
    stairs_count: planField(report, 'plan.stairs_count', 'stairs_count', plan, 'AUTO_FILL_EDITABLE'),
    electrical_grounding: planField(report, 'plan.electrical_grounding', 'electrical_grounding', plan),
    lightning_protection: planField(report, 'plan.lightning_protection', 'lightning_protection', plan),
    backup_generator: planField(report, 'plan.backup_generator', 'backup_generator', plan),
    fire_alarm_system: planField(report, 'plan.fire_alarm_system', 'fire_alarm_system', plan),
    sprinkler_system: planField(report, 'plan.sprinkler_system', 'sprinkler_system', plan),
    civil_defense_branch: makeField({
      report,
      fieldKey: 'plan.civil_defense_branch',
      classification: 'MANUAL',
      candidates: asNullableString(report.civil_defense_branch)
        ? [{ value: asNullableString(report.civil_defense_branch), source_stage: 'legacy_technical_report', source_key: 'technical_report.civil_defense_branch', status: 'legacy' }]
        : [],
    }),
    special_rescue_team_required: planField(report, 'plan.special_rescue_team_required', 'special_rescue_team_required', plan),
  };
}

/**
 * Builds the normalized source bridge for the current live project state.
 * Upstream values are intentionally recomputed on every call. Only explicit
 * `technical_report.source_overrides` become sticky final values.
 */
export function buildTechnicalReportSourceData(params: BuildParams): TechnicalReportSourceData {
  const report = params.engineeringData.technical_report;
  const floors = buildSpaceSafetyFloors({ report, designCenter: params.engineeringData.design_center });
  const effectiveFloors = floors.length ? floors : buildLegacyFloors(report);

  return {
    version: 1,
    project: buildProject(params),
    plan: buildPlan(report, params.engineeringData.building_plan),
    floors: effectiveFloors,
    aggregates: buildAggregates(effectiveFloors),
    precedence: FIELD_PRECEDENCE,
  };
}

/** Returns a shallow TechnicalReport patch containing only an explicit decision. */
export function applyTechnicalReportSourceOverride(params: {
  report: TechnicalReport;
  fieldKey: string;
  value: TechnicalReportSourceOverrideValue;
  note?: string;
  approvedBy?: string;
  approvedAt?: string;
}): TechnicalReport {
  return {
    ...params.report,
    source_overrides: {
      ...(params.report.source_overrides || {}),
      [params.fieldKey]: {
        value: params.value,
        ...(params.note ? { note: params.note } : {}),
        ...(params.approvedBy ? { approved_by: params.approvedBy } : {}),
        ...(params.approvedAt ? { approved_at: params.approvedAt } : {}),
      },
    },
  };
}

/**
 * Applies one explicit engineer decision as a top-level project patch. It is safe
 * for the existing `saveEngineeringLive` flow because it retains every sibling
 * domain (Design Center, Space Safety, Plan Information, attachments and legacy
 * report fields) unchanged.
 */
export function patchTechnicalReportSourceOverride(params: {
  data: ProjectEngineeringData;
  fieldKey: string;
  value: TechnicalReportSourceOverrideValue;
  note?: string;
  approvedBy?: string;
  approvedAt?: string;
}): ProjectEngineeringData {
  return {
    ...params.data,
    technical_report: applyTechnicalReportSourceOverride({
      report: params.data.technical_report,
      fieldKey: params.fieldKey,
      value: params.value,
      note: params.note,
      approvedBy: params.approvedBy,
      approvedAt: params.approvedAt,
    }),
  };
}

/** Removes an explicit decision so the latest upstream source can be inherited again. */
export function clearTechnicalReportSourceOverride(
  report: TechnicalReport,
  fieldKey: string
): TechnicalReport {
  const sourceOverrides = { ...(report.source_overrides || {}) };
  delete sourceOverrides[fieldKey];
  return {
    ...report,
    source_overrides: Object.keys(sourceOverrides).length ? sourceOverrides : undefined,
  };
}
