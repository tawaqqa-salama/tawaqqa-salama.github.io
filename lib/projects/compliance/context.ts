/**
 * Build deterministic ComplianceRuleContext from the canonical engineering dataset.
 *
 * Canonical source: ProjectEngineeringData from project_engineering_live.payload
 * (legacy clients.project_engineering_data is compatibility only — conflicts → CONFLICT).
 *
 * Never invents engineering values — MISSING / INVALID / CONFLICT → nulls → NEEDS_DATA.
 * Does not encode new SBC/NFPA thresholds (Phase 2.3 prerequisite only).
 */

import { getZoneUse } from '@/lib/constants/zone-uses';
import { SBC_OCCUPANCIES, SBC_STRUCTURE_RULES, type SbcOccupancyCode } from '@/lib/constants/sbc801';
import {
  designPumpDemandLpm,
  EMPTY_FIRE_PROTECTION_DESIGN,
  flowToLpm,
  psiToBar,
  type FireProtectionDesign,
  type MeasuredValue,
  type PressureUnit,
} from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import {
  hasNonEmpty,
  parseNumber,
  parseYesNoUnknown,
  ynFromYesNoValue,
} from '@/lib/projects/compliance/evidence';
import type {
  ComplianceRuleContext,
  EngineerOverride,
  ProjectComplianceState,
  Sbc201EgressInputs,
} from '@/lib/projects/compliance/types';
import { buildOccupantEgressRows, collectOccupancies } from '@/lib/projects/sbc-classification';
import {
  normalizeConstructionValue,
  SBC_CONSTRUCTION_TYPE_OPTIONS,
} from '@/lib/projects/sbc-recommendation';
import {
  resolveEngineeringFields,
  type EngineeringResolverBundle,
} from '@/lib/projects/compliance/resolvers';

function pressureToBar(m: MeasuredValue<PressureUnit> | null | undefined): number | null {
  if (!m || m.value == null || !Number.isFinite(m.value)) return null;
  return m.unit === 'psi' ? psiToBar(m.value) : m.value;
}

function metricValue(
  metrics: Array<{ label: string; value: string }> | undefined,
  patterns: RegExp[]
): number | null {
  if (!metrics?.length) return null;
  for (const m of metrics) {
    if (patterns.some((p) => p.test(m.label))) {
      const n = parseNumber(m.value);
      if (n != null) return n;
    }
  }
  return null;
}

function metricText(
  metrics: Array<{ label: string; value: string }> | undefined,
  patterns: RegExp[]
): string | null {
  if (!metrics?.length) return null;
  for (const m of metrics) {
    if (patterns.some((p) => p.test(m.label)) && hasNonEmpty(m.value)) return m.value.trim();
  }
  return null;
}

function boolMetric(
  metrics: Array<{ label: string; value: string }> | undefined,
  patterns: RegExp[]
): boolean | null {
  if (!metrics?.length) return null;
  for (const m of metrics) {
    if (patterns.some((p) => p.test(m.label))) {
      const yn = parseYesNoUnknown(m.value);
      if (yn === 'yes') return true;
      if (yn === 'no') return false;
      const n = parseNumber(m.value);
      if (n != null) return n > 0;
      if (hasNonEmpty(m.value)) return null;
    }
  }
  return null;
}

/**
 * Resolve construction type only when value matches SBC construction options.
 * Does NOT treat arbitrary building_type_code as construction type.
 */
export function resolveConstructionType(raw: string | null | undefined): string | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const normalized = normalizeConstructionValue(text);
  if (!normalized) return null;
  const hit = SBC_CONSTRUCTION_TYPE_OPTIONS.find((o) => o.value === normalized);
  return hit ? hit.value : null;
}

export function resolveFireProtectionDesign(
  data: ProjectEngineeringData | null | undefined
): FireProtectionDesign {
  return data?.fire_protection_design
    ? { ...EMPTY_FIRE_PROTECTION_DESIGN, ...data.fire_protection_design }
    : { ...EMPTY_FIRE_PROTECTION_DESIGN };
}

/**
 * Building area only — never falls back to total_site_area_m2.
 * Prefer explicit FP area or zone sum; do not invent.
 * @deprecated Prefer resolveEngineeringFields().fireAreaM2 (CONFLICT-aware).
 */
export function resolveBuildingAreaM2(params: {
  fpArea?: string | null;
  clientBuildingArea?: number | null;
  zoneAreasSum?: number | null;
}): number | null {
  const fromFp = parseNumber(params.fpArea);
  if (fromFp != null && fromFp > 0) return fromFp;
  if (params.zoneAreasSum != null && params.zoneAreasSum > 0) return params.zoneAreasSum;
  // client.building_area is CRM projection — not silently used as compliance area
  void params.clientBuildingArea;
  return null;
}

/**
 * Build SBC 201 Chapter 10 MoE inputs ONLY from canonical engineering data.
 * Missing fields stay null → rules return NEEDS_DATA / BLOCKED.
 * Never assumes defaults, estimates, or vision/DI values.
 */
export function buildSbc201EgressFromCanonical(params: {
  data: ProjectEngineeringData;
  resolved: EngineeringResolverBundle;
  occupantLoadTotal: number | null;
  sprinklerStatus: 'sprinklered' | 'non_sprinklered' | null;
}): Sbc201EgressInputs {
  const { resolved } = params;
  // Egress measurements ONLY from resolved.egress when VALID.
  // MISSING / INVALID / CONFLICT → all egress measurements stay null (no bp/FP/legacy fallback).
  const egress = resolved.egress.state === 'VALID' ? resolved.egress.value : null;
  const occupancy = resolved.occupancy.state === 'VALID' ? resolved.occupancy.value : null;
  const zones = resolved.zones.state === 'VALID' ? resolved.zones.value : null;
  const fireArea = resolved.fireAreaM2.state === 'VALID' ? resolved.fireAreaM2.value : null;
  const hydraulicAttachments = params.data.plan_attachments?.hydraulic_calculations || [];

  const primaryZone = zones?.[0] || null;

  return {
    occupancyGroup: primaryZone?.occupancy_code || occupancy || null,
    occupancy: occupancy,
    spaceUse: primaryZone?.zone_label || null,
    grossArea: fireArea,
    netArea: null,
    applicableAreaBasis: fireArea != null ? 'gross' : null,
    occupantLoadFactor: primaryZone?.load_factor_m2 ?? null,
    occupantLoadFactorMapping: null,
    calculatedOccupantLoad: params.occupantLoadTotal,
    designOccupantLoad: params.occupantLoadTotal,
    storyOccupantLoad: params.occupantLoadTotal,
    buildingOccupantLoad: params.occupantLoadTotal,
    storyLevel: null,
    story: null,
    sprinklerStatus: params.sprinklerStatus,
    exitsProvided: egress?.exits_count ?? null,
    exitAccessDoorways: egress?.exits_count ?? null,
    specialOccupancyCondition: null,
    numberOfExitsMapping: null,
    travelDistance: egress?.travel_distance_m ?? null,
    commonPath: egress?.common_path_m ?? null,
    applicableTableException: null,
    singleExitMapping: null,
    occupantLoadServed: params.occupantLoadTotal,
    exitComponentType: null,
    clearWidth: egress?.door_width_m ?? egress?.corridor_width_m ?? null,
    applicableCapacityFactor: null,
    sprinklerCondition: params.sprinklerStatus,
    applicableTableSection: null,
    capacityMapping: null,
    requiredExitCount: null,
    areaDimensions: null,
    diagonalDimension: null,
    exitToExitDistance: null,
    applicableException: null,
    separationMapping: null,
    commonPathDistance: egress?.common_path_m ?? null,
    commonPathMapping: null,
    specialCondition: null,
    travelDistanceMapping: null,
    corridorType: null,
    corridorClearWidth: egress?.corridor_width_m ?? null,
    corridorMapping: null,
    deadEndLength: egress?.dead_end_m ?? null,
    corridorConfiguration: null,
    deadEndMapping: null,
    doorType: null,
    clearOpeningWidth: egress?.door_width_m ?? null,
    leafWidth: null,
    doorClearMapping: null,
    doorSwingDirection: null,
    doorSwingMapping: null,
    panicHardware: null,
    fireExitHardware: null,
    panicHardwareMapping: null,
    stairCount: egress?.stairs_count ?? null,
    stairClearWidth: egress?.stair_width_m ?? null,
    stairWidthMapping: null,
    // Attachment presence alone never implies MoE completeness (rules enforce this)
    attachmentCount: hydraulicAttachments.length,
  };
}

export function buildComplianceContext(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  overrides?: EngineerOverride[];
}): ComplianceRuleContext {
  const { client, data } = params;
  const resolved = resolveEngineeringFields({ client, data });

  const bp = data.building_plan || {};
  const tr = data.technical_report || {};
  const fp = resolveFireProtectionDesign(data);
  const floors = tr.floor_uses || [];
  const egressRows = buildOccupantEgressRows(floors);
  const occCodes = collectOccupancies(floors);
  const mixed = new Set(occCodes.map((c) => SBC_OCCUPANCIES[c]?.group_letter).filter(Boolean)).size > 1;

  const height = resolved.buildingHeightM.state === 'VALID' ? resolved.buildingHeightM.value : null;
  const stories = resolved.floorsCount.state === 'VALID' ? resolved.floorsCount.value : null;
  const basement = parseNumber(bp.basement_floors_count);

  const buildingArea = resolved.fireAreaM2.state === 'VALID' ? resolved.fireAreaM2.value : null;
  const siteArea = parseNumber(bp.total_site_area_m2);

  const constructionType =
    resolved.constructionType.state === 'VALID' ? resolved.constructionType.value : null;
  const rawBuildingTypeCode =
    resolved.buildingType.state === 'VALID' ? resolved.buildingType.value : bp.building_type_code?.trim() || null;

  const highRiseExplicit = ynFromYesNoValue(bp.high_rise_building);
  let highRise: boolean | null = null;
  if (highRiseExplicit === 'yes') highRise = true;
  else if (highRiseExplicit === 'no') highRise = false;
  else if (height != null) highRise = height > SBC_STRUCTURE_RULES.high_rise_floor_height_m;

  const occupantTotal = egressRows.reduce((sum, r) => sum + (r.occupants || 0), 0) || null;
  const hasOccupantRows = egressRows.some((r) => r.occupants != null);

  const special: string[] = [];
  if (ynFromYesNoValue(bp.atrium_exists) === 'yes') special.push('atrium');
  if (ynFromYesNoValue(bp.windowless_building) === 'yes') special.push('windowless');
  if (ynFromYesNoValue(bp.underground_building) === 'yes') special.push('underground');
  if (ynFromYesNoValue(bp.special_rescue_team_required) === 'yes') special.push('special_rescue');

  const groupFromZones = occCodes[0] ? SBC_OCCUPANCIES[occCodes[0]]?.group_letter : null;
  const primaryOccCode = occCodes[0] || null;

  // Pump: only use measured FP values — never designPumpDemandLpm estimate as if measured
  const pumpMeasured =
    flowToLpm(fp.pump.capacity) ?? flowToLpm(fp.pump.rated_flow) ?? null;
  const pumpFromResolver =
    resolved.pump.state === 'VALID' ? resolved.pump.value?.flow_lpm ?? null : null;
  const pumpLpm = pumpMeasured ?? pumpFromResolver;
  // Keep designPumpDemandLpm available only as non-authoritative hint (not assigned to pump_flow)
  void designPumpDemandLpm;

  const pumpPressure =
    (resolved.pump.state === 'VALID' ? resolved.pump.value?.pressure_bar ?? null : null) ??
    pressureToBar(fp.pump.pressure) ??
    pressureToBar(fp.pump.rated_pressure);

  const tankRequired =
    resolved.tank.state === 'VALID' ? resolved.tank.value?.required_m3 ?? null : fp.water_tank.calculated_required_volume_m3;
  const tankVolume =
    resolved.tank.state === 'VALID' ? resolved.tank.value?.capacity_m3 ?? null : fp.water_tank.capacity_m3?.value ?? null;
  const tankDuration =
    resolved.tank.state === 'VALID' ? resolved.tank.value?.duration_min ?? null : fp.water_tank.duration_min?.value ?? null;

  const sprinklerDemand = parseNumber(fp.sprinkler.design_flow);
  const kFactor = parseNumber(fp.sprinkler.k_factor);
  const designPressure = parseNumber(fp.sprinkler.design_pressure);

  // Egress measurement bag — ONLY when egress resolver is VALID (no raw FP fallback).
  const egressResolved = resolved.egress.state === 'VALID' ? resolved.egress.value : null;
  const egressMetrics = egressResolved?.metrics || [];
  // Hydraulic network fields may still read FP metric labels (unrelated to MoE gate inputs).
  const hydraulicMetrics = fp.egress?.metrics || [];

  const pipeDiameter =
    metricValue(hydraulicMetrics, [/pipe\s*diam|قطر\s*الأنبوب|قطر\s*الأنابيب/i]) ?? null;
  const pipeLength = metricValue(hydraulicMetrics, [/pipe\s*length|طول\s*الأنبوب|طول\s*الأنابيب/i]);
  const elevation = metricValue(hydraulicMetrics, [/elevation|منسوب|ارتفاع\s*هيدرول/i]);
  const friction = metricValue(hydraulicMetrics, [/friction|فاقد|loss/i]);
  const remoteArea = metricValue(hydraulicMetrics, [/remote\s*area|منطقة\s*نائية|remote/i]);
  const nodeDemand = metricValue(hydraulicMetrics, [/node\s*demand|طلب\s*العقدة/i]);
  const residual = metricValue(hydraulicMetrics, [/residual|ضغط\s*متبقي|required\s*residual/i]);

  const hydraulicAttachments = data.plan_attachments?.hydraulic_calculations || [];
  const hasHydNetwork = Boolean(
    kFactor != null &&
      sprinklerDemand != null &&
      designPressure != null &&
      pipeDiameter != null &&
      pipeLength != null &&
      elevation != null &&
      friction != null &&
      remoteArea != null &&
      nodeDemand != null &&
      residual != null &&
      pumpLpm != null &&
      pumpPressure != null
  );

  const ventItems = (tr.ventilation_items || []).filter((i) => i.enabled);
  const smokeStatus = fp.supporting_systems?.smoke_control?.status || 'unknown';
  const smokeRequiredOccupancy =
    occCodes.includes('parking' as SbcOccupancyCode) ||
    occCodes.includes('high_hazard' as SbcOccupancyCode) ||
    special.includes('atrium') ||
    highRise === true;

  const complianceState = (data as { compliance?: ProjectComplianceState }).compliance;
  const overrides = params.overrides ?? complianceState?.overrides ?? [];

  const primaryOcc =
    resolved.occupancy.state === 'VALID'
      ? resolved.occupancy.value
      : null;

  const sprinklerProvided = ynFromYesNoValue(bp.sprinkler_system);
  const sprinklerVerified = Boolean(
    sprinklerProvided === 'yes' &&
      hasNonEmpty(fp.sprinkler.system_type) &&
      sprinklerDemand != null &&
      kFactor != null
  );

  const alarmProvided = ynFromYesNoValue(bp.fire_alarm_system);
  const alarmVerified = Boolean(
    alarmProvided === 'yes' &&
      hasNonEmpty(fp.fire_alarm?.control_panel) &&
      (hasNonEmpty(fp.fire_alarm?.smoke_detectors) || hasNonEmpty(fp.fire_alarm?.heat_detectors)) &&
      hasNonEmpty(fp.fire_alarm?.manual_call_points)
  );

  const sprinklerStatus: 'sprinklered' | 'non_sprinklered' | null =
    sprinklerProvided === 'yes' ? 'sprinklered' : sprinklerProvided === 'no' ? 'non_sprinklered' : null;

  const applicableCodes =
    resolved.applicableCodes.state === 'VALID' ? resolved.applicableCodes.value || [] : [];

  // Design-center calculation estimates must NEVER seed measured compliance inputs
  const calcEstimates = data.design_center?.calculations || [];
  const hasEstimateAuthority = calcEstimates.some(
    (c) =>
      c.status === 'estimated' ||
      c.authority === 'estimate' ||
      (c.values && (c.values.estimated_demand_lpm != null || c.values.estimated_volume_m3 != null))
  );
  void hasEstimateAuthority; // explicit non-use in measured fields below

  const sbc201Egress = buildSbc201EgressFromCanonical({
    data,
    resolved,
    occupantLoadTotal: hasOccupantRows ? occupantTotal : null,
    sprinklerStatus,
  });

  return {
    evaluatedAt: new Date().toISOString(),
    client: {
      id: client.id,
      name: client.business_name || client.name,
      activity_type: client.activity_type,
      floors_count: client.floors_count,
      building_area: client.building_area,
      land_area: client.land_area,
    },
    building: {
      occupancy_classification: primaryOcc,
      building_type_code: rawBuildingTypeCode,
      group_letter: groupFromZones || null,
      construction_type: constructionType,
      building_area_m2: buildingArea,
      total_site_area_m2: siteArea,
      building_height_m: height,
      stories,
      basement_floors: basement,
      high_rise: highRise,
      mixed_occupancy: mixed,
      underground:
        ynFromYesNoValue(bp.underground_building) === 'yes'
          ? true
          : ynFromYesNoValue(bp.underground_building) === 'no'
            ? false
            : null,
      windowless:
        ynFromYesNoValue(bp.windowless_building) === 'yes'
          ? true
          : ynFromYesNoValue(bp.windowless_building) === 'no'
            ? false
            : null,
      atrium:
        ynFromYesNoValue(bp.atrium_exists) === 'yes'
          ? true
          : ynFromYesNoValue(bp.atrium_exists) === 'no'
            ? false
            : null,
      special_conditions: special,
      primary_occupancy_code: primaryOccCode,
    },
    occupancyZones: egressRows.map((r) => {
      const zone = floors
        .flatMap((f) => (f.zones || []).map((z) => ({ floor: f.floor_name, z })))
        .find((x) => x.floor === r.floor_name && x.z.label === r.zone_label);
      const use = zone ? getZoneUse(zone.z.use_code) : null;
      return {
        floor_name: r.floor_name,
        zone_label: r.zone_label,
        occupancy_code: zone?.z.occupancy_code || null,
        group_letter: zone?.z.group_letter || null,
        area_m2: r.area_m2,
        occupant_load: r.occupants,
        load_factor_m2: r.factor ?? use?.occupant_load_factor_m2 ?? null,
      };
    }),
    egress: {
      occupant_load_total: hasOccupantRows ? occupantTotal : null,
      // MoE measurements: resolved VALID only — never raw bp / FP fallback.
      exits_count: egressResolved?.exits_count ?? null,
      stairs_count: egressResolved?.stairs_count ?? null,
      emergency_exit_doors:
        resolved.egress.state === 'VALID' ? bp.emergency_exits_doors || null : null,
      travel_distance_m: egressResolved?.travel_distance_m ?? null,
      common_path_m: egressResolved?.common_path_m ?? null,
      dead_end_m: egressResolved?.dead_end_m ?? null,
      exit_capacity_persons:
        resolved.egress.state === 'VALID'
          ? metricValue(egressMetrics, [/capacity|سعة\s*المخرج|طاقة\s*الاستيعاب/i])
          : null,
      exit_separation_m:
        resolved.egress.state === 'VALID'
          ? metricValue(egressMetrics, [/^(?!.*required).*separation|تباعد|فصل\s*المخارج/i])
          : null,
      required_exit_separation_m:
        resolved.egress.state === 'VALID'
          ? metricValue(egressMetrics, [
              /required\s*(exit\s*)?separation|الحد\s*الأدنى\s*(لتباعد|لفصل)\s*المخارج/i,
            ])
          : null,
      corridor_width_m: egressResolved?.corridor_width_m ?? null,
      required_corridor_width_m:
        resolved.egress.state === 'VALID'
          ? metricValue(egressMetrics, [
              /required\s*corridor|الحد\s*الأدنى\s*لعرض\s*الممر|corridor.*required/i,
            ])
          : null,
      door_width_m: egressResolved?.door_width_m ?? null,
      required_door_width_m:
        resolved.egress.state === 'VALID'
          ? metricValue(egressMetrics, [
              /required\s*door|الحد\s*الأدنى\s*لعرض\s*الباب|door.*required/i,
            ])
          : null,
      stair_width_m: egressResolved?.stair_width_m ?? null,
      required_stair_width_m:
        resolved.egress.state === 'VALID'
          ? metricValue(egressMetrics, [
              /required\s*stair|الحد\s*الأدنى\s*لعرض\s*الدرج|stair.*required/i,
            ])
          : null,
      exit_discharge_ok:
        resolved.egress.state === 'VALID'
          ? boolMetric(egressMetrics, [/discharge|تصريف\s*الخروج|مخرج\s*نهائي/i])
          : null,
      exit_access_ok:
        resolved.egress.state === 'VALID'
          ? boolMetric(egressMetrics, [/exit\s*access|مسار\s*الوصول/i])
          : null,
      notes: resolved.egress.state === 'VALID' ? fp.egress?.notes || null : null,
      metrics: egressMetrics.map((m) => ({ label: m.label, value: m.value })),
      sprinkler_status: sprinklerStatus,
    },
    fireAccess: {
      site_entrance: fp.fire_truck_access?.site_entrance || null,
      fire_road: fp.fire_truck_access?.fire_road || null,
      road_width_m: parseNumber(fp.fire_truck_access?.road_width_m),
      required_road_width_m:
        metricValue(hydraulicMetrics, [/required\s*(access|road)\s*width|الحد\s*الأدنى\s*لعرض\s*(الطريق|الوصول)/i]) ??
        null,
      required_road_width_code_ref:
        metricText(hydraulicMetrics, [/access\s*width\s*(code|ref)|مرجع.*عرض\s*(الطريق|الوصول)|FAC.*code/i]) ??
        null,
      building_access: fp.fire_truck_access?.building_access || null,
      staging_area: fp.fire_truck_access?.staging_area || null,
      fdc_present: fp.fire_truck_access?.civil_defense_connection || null,
      fdc_location: fp.fire_truck_access?.connection_location || null,
      notes: fp.fire_truck_access?.notes || null,
    },
    fireProtection: {
      hazard_class: fp.occupancy.hazard_class || tr.risk_class || null,
      sprinkler_required:
        fp.sprinkler.required === 'yes' || fp.sprinkler.required === 'no' || fp.sprinkler.required === 'unknown'
          ? fp.sprinkler.required
          : null,
      sprinkler_provided: sprinklerProvided,
      sprinkler_verified: sprinklerVerified,
      sprinkler_system_type: fp.sprinkler.system_type || null,
      design_area_m2: null,
      density_lpm_m2: null,
      sprinkler_demand_lpm: sprinklerDemand,
      hose_allowance_lpm: null,
      standpipe_required:
        fp.standpipe.required === 'yes' || fp.standpipe.required === 'no' || fp.standpipe.required === 'unknown'
          ? fp.standpipe.required
          : null,
      standpipe_provided: null,
      pump_exists:
        resolved.pump.state === 'VALID'
          ? (resolved.pump.value?.exists as 'yes' | 'no' | 'unknown' | null) ?? null
          : fp.pump.exists === 'yes' || fp.pump.exists === 'no' || fp.pump.exists === 'unknown'
            ? fp.pump.exists
            : null,
      pump_flow_lpm: pumpLpm,
      pump_pressure_bar: pumpPressure,
      tank_exists:
        resolved.tank.state === 'VALID'
          ? (resolved.tank.value?.exists as 'yes' | 'no' | 'unknown' | null) ?? null
          : fp.water_tank.exists === 'yes' ||
              fp.water_tank.exists === 'no' ||
              fp.water_tank.exists === 'unknown'
            ? fp.water_tank.exists
            : null,
      tank_volume_m3: tankVolume,
      tank_duration_min: tankDuration,
      tank_required_m3: tankRequired,
      fdc_required: null,
      extinguisher_count:
        (fp.extinguishers || []).reduce((n, e) => n + (parseNumber(e.count) || 0), 0) || null,
      applicable_codes: applicableCodes,
    },
    hydraulic: {
      has_network_data: hasHydNetwork,
      attachment_count: hydraulicAttachments.length,
      k_factor: kFactor,
      flow_lpm: sprinklerDemand,
      pressure_bar: designPressure,
      required_residual_pressure_bar: residual,
      pipe_diameter_mm: pipeDiameter,
      pipe_length_m: pipeLength,
      elevation_m: elevation,
      friction_loss_bar: friction,
      remote_area_m2: remoteArea,
      node_demand_lpm: nodeDemand,
      pump_flow_lpm: pumpLpm,
      pump_pressure_bar: pumpPressure,
      tank_volume_m3: tankVolume,
    },
    fireAlarm: {
      panel: fp.fire_alarm?.control_panel || null,
      detection:
        [fp.fire_alarm?.smoke_detectors, fp.fire_alarm?.heat_detectors].filter(hasNonEmpty).join(' / ') ||
        null,
      manual_call_points: fp.fire_alarm?.manual_call_points || null,
      notification:
        [fp.fire_alarm?.bells, fp.fire_alarm?.voice_alarm].filter(hasNonEmpty).join(' / ') || null,
      emergency_power: fp.supporting_systems?.emergency_power?.status || null,
      coverage: null,
      interfaces: fp.fire_alarm?.integration || null,
      cause_and_effect: null,
      required: null,
      provided: alarmProvided,
      verified: alarmVerified,
      building_plan_alarm: ynFromYesNoValue(bp.fire_alarm_system) || '',
    },
    smokeControl: {
      required: smokeRequiredOccupancy ? true : null,
      status: smokeStatus,
      note: fp.supporting_systems?.smoke_control?.note || null,
      ventilation_only: ventItems.length > 0 && smokeStatus === 'unknown',
    },
    overrides,
    sbc201Egress,
  };
}
