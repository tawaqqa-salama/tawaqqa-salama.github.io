/**
 * Build deterministic ComplianceRuleContext from live project data.
 * Never invents engineering values — missing → null / empty.
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
} from '@/lib/projects/compliance/types';
import { buildOccupantEgressRows, collectOccupancies } from '@/lib/projects/sbc-classification';
import {
  normalizeConstructionValue,
  SBC_CONSTRUCTION_TYPE_OPTIONS,
} from '@/lib/projects/sbc-recommendation';

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
 * Sources (in order): fire protection occupancy area, client.building_area,
 * sum of floor/zone areas when available.
 */
export function resolveBuildingAreaM2(params: {
  fpArea?: string | null;
  clientBuildingArea?: number | null;
  zoneAreasSum?: number | null;
}): number | null {
  const fromFp = parseNumber(params.fpArea);
  if (fromFp != null && fromFp > 0) return fromFp;
  if (params.clientBuildingArea != null && Number(params.clientBuildingArea) > 0) {
    return Number(params.clientBuildingArea);
  }
  if (params.zoneAreasSum != null && params.zoneAreasSum > 0) return params.zoneAreasSum;
  return null;
}

export function buildComplianceContext(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  overrides?: EngineerOverride[];
}): ComplianceRuleContext {
  const { client, data } = params;
  const bp = data.building_plan || {};
  const tr = data.technical_report || {};
  const fp = resolveFireProtectionDesign(data);
  const floors = tr.floor_uses || [];
  const egressRows = buildOccupantEgressRows(floors);
  const occCodes = collectOccupancies(floors);
  const mixed = new Set(occCodes.map((c) => SBC_OCCUPANCIES[c]?.group_letter).filter(Boolean)).size > 1;

  const height = parseNumber(bp.building_height_m);
  const stories =
    parseNumber(bp.floors_description) ??
    parseNumber(fp.occupancy.floors_count) ??
    (client.floors_count != null ? Number(client.floors_count) : null);
  const basement = parseNumber(bp.basement_floors_count);

  const zoneAreasSum = egressRows.reduce((s, r) => s + (r.area_m2 || 0), 0) || null;
  const buildingArea = resolveBuildingAreaM2({
    fpArea: fp.occupancy.area_m2,
    clientBuildingArea: client.building_area,
    zoneAreasSum,
  });
  const siteArea = parseNumber(bp.total_site_area_m2);

  // construction_type: only when building_type_code matches construction options
  // (Stage 2 UI currently stores construction in building_type_code when Type I-A… selected)
  const constructionType = resolveConstructionType(bp.building_type_code);
  // building_type_code in context = raw field for traceability; not used as construction substitute in OCC-03
  const rawBuildingTypeCode = bp.building_type_code?.trim() || null;

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

  const pumpLpm =
    flowToLpm(fp.pump.capacity) ??
    flowToLpm(fp.pump.rated_flow) ??
    designPumpDemandLpm(fp);
  const pumpPressure = pressureToBar(fp.pump.pressure) ?? pressureToBar(fp.pump.rated_pressure);
  const tankRequired = fp.water_tank.calculated_required_volume_m3;
  const sprinklerDemand = parseNumber(fp.sprinkler.design_flow);
  const kFactor = parseNumber(fp.sprinkler.k_factor);
  const designPressure = parseNumber(fp.sprinkler.design_pressure);

  const metrics = fp.egress?.metrics || [];
  const accessMetrics = metrics; // shared metric bag for optional required widths

  const pipeDiameter =
    metricValue(metrics, [/pipe\s*diam|قطر\s*الأنبوب|قطر\s*الأنابيب/i]) ?? null;
  const pipeLength = metricValue(metrics, [/pipe\s*length|طول\s*الأنبوب|طول\s*الأنابيب/i]);
  const elevation = metricValue(metrics, [/elevation|منسوب|ارتفاع\s*هيدرول/i]);
  const friction = metricValue(metrics, [/friction|فاقد|loss/i]);
  const remoteArea = metricValue(metrics, [/remote\s*area|منطقة\s*نائية|remote/i]);
  const nodeDemand = metricValue(metrics, [/node\s*demand|طلب\s*العقدة/i]);
  const residual = metricValue(metrics, [/residual|ضغط\s*متبقي|required\s*residual/i]);

  const hydraulicAttachments = data.plan_attachments?.hydraulic_calculations || [];
  // Attachment count is informational only — NEVER implies complete network data
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

  const primaryOcc = bp.occupancy_classification || tr.building_classification || '';

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
      occupancy_classification: primaryOcc || null,
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
      exits_count: parseNumber(bp.exits_count),
      stairs_count: parseNumber(bp.stairs_count),
      emergency_exit_doors: bp.emergency_exits_doors || null,
      travel_distance_m: metricValue(metrics, [/travel|مسافة\s*السفر|مسافة السفر/i]),
      common_path_m: metricValue(metrics, [/common\s*path|مسار\s*مشترك/i]),
      dead_end_m: metricValue(metrics, [/dead\s*end|طريق\s*مسدود/i]),
      exit_capacity_persons: metricValue(metrics, [/capacity|سعة\s*المخرج|طاقة\s*الاستيعاب/i]),
      exit_separation_m: metricValue(metrics, [/^(?!.*required).*separation|تباعد|فصل\s*المخارج/i]),
      required_exit_separation_m: metricValue(metrics, [
        /required\s*(exit\s*)?separation|الحد\s*الأدنى\s*(لتباعد|لفصل)\s*المخارج/i,
      ]),
      corridor_width_m: metricValue(metrics, [/^(?!.*required).*corridor|عرض\s*الممر(?!.*مطلوب)/i]),
      required_corridor_width_m: metricValue(metrics, [
        /required\s*corridor|الحد\s*الأدنى\s*لعرض\s*الممر|corridor.*required/i,
      ]),
      door_width_m: metricValue(metrics, [/^(?!.*required).*door\s*width|عرض\s*الباب(?!.*مطلوب)/i]),
      required_door_width_m: metricValue(metrics, [
        /required\s*door|الحد\s*الأدنى\s*لعرض\s*الباب|door.*required/i,
      ]),
      stair_width_m: metricValue(metrics, [/^(?!.*required).*stair\s*width|عرض\s*الدرج(?!.*مطلوب)/i]),
      required_stair_width_m: metricValue(metrics, [
        /required\s*stair|الحد\s*الأدنى\s*لعرض\s*الدرج|stair.*required/i,
      ]),
      exit_discharge_ok: boolMetric(metrics, [/discharge|تصريف\s*الخروج|مخرج\s*نهائي/i]),
      exit_access_ok: boolMetric(metrics, [/exit\s*access|مسار\s*الوصول/i]),
      notes: fp.egress?.notes || null,
      metrics: metrics.map((m) => ({ label: m.label, value: m.value })),
      // Explicit only — never assume sprinklered because an FP package exists
      sprinkler_status:
        sprinklerProvided === 'yes' ? 'sprinklered' : sprinklerProvided === 'no' ? 'non_sprinklered' : null,
    },
    fireAccess: {
      site_entrance: fp.fire_truck_access?.site_entrance || null,
      fire_road: fp.fire_truck_access?.fire_road || null,
      road_width_m: parseNumber(fp.fire_truck_access?.road_width_m),
      required_road_width_m:
        metricValue(accessMetrics, [/required\s*(access|road)\s*width|الحد\s*الأدنى\s*لعرض\s*(الطريق|الوصول)/i]) ??
        null,
      required_road_width_code_ref:
        metricText(accessMetrics, [/access\s*width\s*(code|ref)|مرجع.*عرض\s*(الطريق|الوصول)|FAC.*code/i]) ??
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
      standpipe_provided: null, // never infer from free-text notes
      pump_exists:
        fp.pump.exists === 'yes' || fp.pump.exists === 'no' || fp.pump.exists === 'unknown'
          ? fp.pump.exists
          : null,
      pump_flow_lpm: pumpLpm,
      pump_pressure_bar: pumpPressure,
      tank_exists:
        fp.water_tank.exists === 'yes' || fp.water_tank.exists === 'no' || fp.water_tank.exists === 'unknown'
          ? fp.water_tank.exists
          : null,
      tank_volume_m3: fp.water_tank.capacity_m3?.value ?? null,
      tank_duration_min: fp.water_tank.duration_min?.value ?? null,
      tank_required_m3: tankRequired,
      fdc_required: null,
      extinguisher_count:
        (fp.extinguishers || []).reduce((n, e) => n + (parseNumber(e.count) || 0), 0) || null,
      applicable_codes: fp.applicable_codes || [],
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
      tank_volume_m3: fp.water_tank.capacity_m3?.value ?? null,
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
  };
}
