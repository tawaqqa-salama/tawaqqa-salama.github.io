/**
 * Engineering field resolvers for the authoritative compliance context.
 *
 * Every resolver returns one of: VALID | MISSING | INVALID | CONFLICT
 * Never silently substitutes defaults or invents PASS-capable values.
 *
 * Inputs come from the canonical ProjectEngineeringData working dataset
 * (live payload, with explicit legacy compatibility layer).
 */

import { getZoneUse } from '@/lib/constants/zone-uses';
import {
  EMPTY_FIRE_PROTECTION_DESIGN,
  flowToLpm,
  psiToBar,
  type FireProtectionDesign,
  type MeasuredValue,
  type PressureUnit,
} from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import { parseNumber } from '@/lib/projects/compliance/evidence';
import {
  normalizeConstructionValue,
  SBC_CONSTRUCTION_TYPE_OPTIONS,
} from '@/lib/projects/sbc-recommendation';
import { buildOccupantEgressRows } from '@/lib/projects/sbc-classification';

function fpFromData(data: ProjectEngineeringData): FireProtectionDesign {
  return data.fire_protection_design
    ? { ...EMPTY_FIRE_PROTECTION_DESIGN, ...data.fire_protection_design }
    : { ...EMPTY_FIRE_PROTECTION_DESIGN };
}

export type ResolverState = 'VALID' | 'MISSING' | 'INVALID' | 'CONFLICT';

export type ResolvedField<T> = {
  state: ResolverState;
  value: T | null;
  sources: string[];
  message?: string;
  unit?: string | null;
  code_ref?: string | null;
  edition?: string | null;
};

function valid<T>(
  value: T,
  sources: string[],
  extra?: Partial<ResolvedField<T>>
): ResolvedField<T> {
  return { state: 'VALID', value, sources, ...extra };
}

function missing<T = never>(sources: string[], message: string): ResolvedField<T> {
  return { state: 'MISSING', value: null, sources, message };
}

function invalid<T = never>(sources: string[], message: string): ResolvedField<T> {
  return { state: 'INVALID', value: null, sources, message };
}

function conflict<T = never>(
  sources: string[],
  message: string,
  value: T | null = null
): ResolvedField<T> {
  return { state: 'CONFLICT', value, sources, message };
}

function text(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function positiveNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseNumber(v);
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

function pressureToBar(m: MeasuredValue<PressureUnit> | null | undefined): number | null {
  if (!m || m.value == null || !Number.isFinite(m.value)) return null;
  return m.unit === 'psi' ? psiToBar(m.value) : m.value;
}

function metaConflicts(data: ProjectEngineeringData): string[] {
  return (data.engineering_meta?.conflicts || []).map((c) => c.field);
}

const LEGACY_HINT = 'engineering_meta.conflicts';

export function resolveOccupancy(params: {
  data: ProjectEngineeringData;
  client: ClientRecord;
}): ResolvedField<string> {
  const bp = text(params.data.building_plan?.occupancy_classification);
  const tr = text(params.data.technical_report?.building_classification);
  const sources = [
    'building_plan.occupancy_classification',
    'technical_report.building_classification',
  ];

  // Canonical owners only — FP occupancy_type / client.activity are not occupancy SoT
  if (bp && tr) {
    const norm = (x: string) => x.replace(/\s+/g, ' ').toLowerCase();
    if (norm(bp) !== norm(tr)) {
      return conflict(
        sources,
        `Occupancy conflict between building_plan and technical_report`
      );
    }
  }

  if (metaConflicts(params.data).some((f) => /building_plan\.occupancy_classification/i.test(f))) {
    return conflict(
      [...sources, LEGACY_HINT],
      'Legacy/live occupancy conflict recorded in engineering_meta'
    );
  }

  if (bp) return valid(bp, ['building_plan.occupancy_classification']);
  if (tr) return valid(tr, ['technical_report.building_classification']);
  return missing(
    sources,
    'Occupancy classification missing on building_plan / technical_report'
  );
}

export function resolveBuildingType(params: {
  data: ProjectEngineeringData;
}): ResolvedField<string> {
  const raw = text(params.data.building_plan?.building_type_code);
  if (!raw) {
    return missing(['building_plan.building_type_code'], 'Building type code missing');
  }
  return valid(raw, ['building_plan.building_type_code']);
}

export function resolveConstructionType(params: {
  data: ProjectEngineeringData;
}): ResolvedField<string> {
  const raw = text(params.data.building_plan?.building_type_code);
  if (!raw) {
    return missing(['building_plan.building_type_code'], 'Construction type missing');
  }
  const normalized = normalizeConstructionValue(raw);
  if (!normalized) {
    return invalid(
      ['building_plan.building_type_code'],
      'building_type_code is not a recognized SBC construction type'
    );
  }
  const hit = SBC_CONSTRUCTION_TYPE_OPTIONS.find((o) => o.value === normalized);
  if (!hit) {
    return invalid(['building_plan.building_type_code'], 'Construction type not in SBC options');
  }
  return valid(hit.value, ['building_plan.building_type_code']);
}

export function resolveFloorAreas(params: {
  data: ProjectEngineeringData;
}): ResolvedField<Array<{ floor_name: string; area_m2: number; zones: number }>> {
  const floors = params.data.technical_report?.floor_uses || [];
  if (!floors.length) {
    return missing(['technical_report.floor_uses'], 'No floors/zones documented');
  }
  const rows: Array<{ floor_name: string; area_m2: number; zones: number }> = [];
  for (const f of floors) {
    const named = text(f.floor_name) || '—';
    const declared = positiveNumber(f.floor_area_m2);
    const zoneSum = (f.zones || []).reduce((s, z) => s + (positiveNumber(z.area_m2) || 0), 0);
    if (declared != null && zoneSum > 0 && Math.abs(declared - zoneSum) / Math.max(declared, zoneSum) > 0.05) {
      return conflict(
        [`technical_report.floor_uses:${named}.floor_area_m2`, `zones_sum`],
        `Floor area conflict on ${named}: declared ${declared} vs zones sum ${zoneSum}`
      );
    }
    const area = declared ?? (zoneSum > 0 ? zoneSum : null);
    if (area == null) {
      return invalid(
        [`technical_report.floor_uses:${named}`],
        `Floor ${named} has no valid area`
      );
    }
    rows.push({ floor_name: named, area_m2: area, zones: (f.zones || []).length });
  }
  return valid(rows, ['technical_report.floor_uses'], { unit: 'm²' });
}

export function resolveZones(params: {
  data: ProjectEngineeringData;
}): ResolvedField<
  Array<{
    floor_name: string;
    zone_label: string;
    area_m2: number | null;
    occupancy_code: string | null;
    load_factor_m2: number | null;
    occupant_load: number | null;
  }>
> {
  const floors = params.data.technical_report?.floor_uses || [];
  const hasZones = floors.some((f) => (f.zones || []).length > 0);
  if (!hasZones) {
    return missing(['technical_report.floor_uses[].zones'], 'No zones documented');
  }
  const egressRows = buildOccupantEgressRows(floors);
  const zones = egressRows.map((r) => {
    const zone = floors
      .flatMap((f) => (f.zones || []).map((z) => ({ floor: f.floor_name, z })))
      .find((x) => x.floor === r.floor_name && x.z.label === r.zone_label);
    const use = zone ? getZoneUse(zone.z.use_code) : null;
    return {
      floor_name: r.floor_name,
      zone_label: r.zone_label,
      area_m2: r.area_m2,
      occupancy_code: zone?.z.occupancy_code || null,
      load_factor_m2: r.factor ?? use?.occupant_load_factor_m2 ?? null,
      occupant_load: r.occupants,
    };
  });
  return valid(zones, ['technical_report.floor_uses[].zones'], { unit: 'm²' });
}

export function resolveNumberOfFloors(params: {
  data: ProjectEngineeringData;
  client: ClientRecord;
}): ResolvedField<number> {
  const fromFloors = params.data.technical_report?.floor_uses?.length
    ? params.data.technical_report.floor_uses.length
    : null;
  const fromPlan = positiveNumber(params.data.building_plan?.floors_description);
  const fromFp = positiveNumber(params.data.fire_protection_design?.occupancy?.floors_count);
  const fromClient =
    params.client.floors_count != null && Number(params.client.floors_count) > 0
      ? Number(params.client.floors_count)
      : null;

  const candidates = [
    fromFloors != null ? { s: 'technical_report.floor_uses.length', v: fromFloors } : null,
    fromPlan != null ? { s: 'building_plan.floors_description', v: fromPlan } : null,
    fromFp != null ? { s: 'fire_protection_design.occupancy.floors_count', v: fromFp } : null,
  ].filter(Boolean) as Array<{ s: string; v: number }>;

  if (candidates.length >= 2) {
    const first = candidates[0].v;
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].v !== first) {
        return conflict(
          candidates.map((c) => c.s),
          `Number of floors conflict: ${candidates.map((c) => `${c.s}=${c.v}`).join(', ')}`
        );
      }
    }
  }

  if (fromFloors != null) return valid(fromFloors, ['technical_report.floor_uses.length']);
  if (fromPlan != null) return valid(fromPlan, ['building_plan.floors_description']);
  // client.floors_count / FP alone are not canonical when plan floors exist path missing
  if (fromFp != null || fromClient != null) {
    return missing(
      [
        'technical_report.floor_uses',
        'building_plan.floors_description',
        'fire_protection_design.occupancy.floors_count',
        'client.floors_count',
      ],
      'Canonical floor count missing — client/FP alone are not authoritative'
    );
  }
  return missing(
    ['technical_report.floor_uses', 'building_plan.floors_description'],
    'Number of floors missing'
  );
}

export function resolveBuildingHeightM(params: {
  data: ProjectEngineeringData;
}): ResolvedField<number> {
  const h = positiveNumber(params.data.building_plan?.building_height_m);
  if (h == null) {
    const raw = text(params.data.building_plan?.building_height_m);
    if (raw) {
      return invalid(['building_plan.building_height_m'], `Invalid building height: ${raw}`);
    }
    return missing(['building_plan.building_height_m'], 'Building height missing');
  }
  return valid(h, ['building_plan.building_height_m'], { unit: 'm' });
}

export function resolveFireAreaM2(params: {
  data: ProjectEngineeringData;
  client: ClientRecord;
}): ResolvedField<number> {
  const fp = fpFromData(params.data);
  const fromFp = positiveNumber(fp.occupancy.area_m2);
  const fromClient =
    params.client.building_area != null && Number(params.client.building_area) > 0
      ? Number(params.client.building_area)
      : null;
  const floors = resolveFloorAreas({ data: params.data });
  const zoneSum =
    floors.state === 'VALID' && floors.value
      ? floors.value.reduce((s, f) => s + f.area_m2, 0)
      : null;

  const present = [
    fromFp != null ? { s: 'fire_protection_design.occupancy.area_m2', v: fromFp } : null,
    zoneSum != null && zoneSum > 0
      ? { s: 'technical_report.floor_uses areas', v: zoneSum }
      : null,
  ].filter(Boolean) as Array<{ s: string; v: number }>;

  if (present.length === 2) {
    const [a, b] = present;
    if (Math.abs(a.v - b.v) / Math.max(a.v, b.v) > 0.05) {
      return conflict(
        [a.s, b.s],
        `Fire/building area conflict: ${a.s}=${a.v} vs ${b.s}=${b.v}`
      );
    }
  }

  if (fromFp != null) {
    return valid(fromFp, ['fire_protection_design.occupancy.area_m2'], { unit: 'm²' });
  }
  if (zoneSum != null && zoneSum > 0) {
    return valid(zoneSum, ['technical_report.floor_uses'], { unit: 'm²' });
  }
  if (fromClient != null) {
    return missing(
      ['fire_protection_design.occupancy.area_m2', 'technical_report.floor_uses', 'client.building_area'],
      'Canonical fire/building area missing — client.building_area alone is not authoritative for compliance'
    );
  }
  return missing(
    ['fire_protection_design.occupancy.area_m2', 'technical_report.floor_uses'],
    'Building/fire area missing'
  );
}

export function resolvePump(params: {
  data: ProjectEngineeringData;
}): ResolvedField<{ flow_lpm: number | null; pressure_bar: number | null; exists: string | null }> {
  const fp = fpFromData(params.data);
  const exists =
    fp.pump.exists === 'yes' || fp.pump.exists === 'no' || fp.pump.exists === 'unknown'
      ? fp.pump.exists
      : null;
  const flow =
    flowToLpm(fp.pump.capacity) ?? flowToLpm(fp.pump.rated_flow) ?? null;
  const pressure = pressureToBar(fp.pump.pressure) ?? pressureToBar(fp.pump.rated_pressure);

  if (exists == null && flow == null && pressure == null) {
    return missing(
      ['fire_protection_design.pump'],
      'Fire pump data missing'
    );
  }
  if (exists === 'yes' && (flow == null || pressure == null)) {
    return missing(
      ['fire_protection_design.pump.capacity', 'fire_protection_design.pump.pressure'],
      'Pump marked present but flow/pressure incomplete'
    );
  }
  return valid(
    { flow_lpm: flow, pressure_bar: pressure, exists },
    ['fire_protection_design.pump'],
    { unit: 'L/min|bar' }
  );
}

export function resolveTank(params: {
  data: ProjectEngineeringData;
}): ResolvedField<{
  capacity_m3: number | null;
  required_m3: number | null;
  duration_min: number | null;
  demand_lpm: number | null;
  exists: string | null;
}> {
  const fp = fpFromData(params.data);
  const exists =
    fp.water_tank.exists === 'yes' ||
    fp.water_tank.exists === 'no' ||
    fp.water_tank.exists === 'unknown'
      ? fp.water_tank.exists
      : null;
  const capacity = fp.water_tank.capacity_m3?.value ?? null;
  const required = fp.water_tank.calculated_required_volume_m3;
  const duration = fp.water_tank.duration_min?.value ?? null;
  const demand = fp.water_tank.water_demand_lpm?.value ?? null;

  if (exists == null && capacity == null && required == null) {
    return missing(['fire_protection_design.water_tank'], 'Tank data missing');
  }
  return valid(
    {
      capacity_m3: capacity,
      required_m3: required,
      duration_min: duration,
      demand_lpm: demand,
      exists,
    },
    ['fire_protection_design.water_tank'],
    { unit: 'm³' }
  );
}

export function resolveEgressData(params: {
  data: ProjectEngineeringData;
}): ResolvedField<{
  exits_count: number | null;
  stairs_count: number | null;
  travel_distance_m: number | null;
  common_path_m: number | null;
  dead_end_m: number | null;
  corridor_width_m: number | null;
  door_width_m: number | null;
  stair_width_m: number | null;
  metrics: Array<{ label: string; value: string }>;
}> {
  const bp = params.data.building_plan || {};
  const fp = fpFromData(params.data);
  const metrics = fp.egress?.metrics || [];

  const metricValue = (patterns: RegExp[]): number | null => {
    for (const m of metrics) {
      if (patterns.some((p) => p.test(m.label))) {
        const n = parseNumber(m.value);
        if (n != null) return n;
      }
    }
    return null;
  };

  const exits = positiveNumber(bp.exits_count);
  const stairs = positiveNumber(bp.stairs_count);
  const travel = metricValue([/travel|مسافة\s*السفر|مسافة السفر/i]);
  const common = metricValue([/common\s*path|مسار\s*مشترك/i]);
  const dead = metricValue([/dead\s*end|طريق\s*مسدود/i]);
  const corridor = metricValue([/^(?!.*required).*corridor|عرض\s*الممر(?!.*مطلوب)/i]);
  const door = metricValue([/^(?!.*required).*door\s*width|عرض\s*الباب(?!.*مطلوب)/i]);
  const stairW = metricValue([/^(?!.*required).*stair\s*width|عرض\s*الدرج(?!.*مطلوب)/i]);

  if (
    exits == null &&
    stairs == null &&
    travel == null &&
    common == null &&
    dead == null &&
    corridor == null &&
    door == null &&
    stairW == null &&
    !metrics.length &&
    !text(bp.emergency_exits_doors)
  ) {
    return missing(
      ['building_plan.exits_*', 'fire_protection_design.egress'],
      'Egress measurements missing'
    );
  }

  return valid(
    {
      exits_count: exits,
      stairs_count: stairs,
      travel_distance_m: travel,
      common_path_m: common,
      dead_end_m: dead,
      corridor_width_m: corridor,
      door_width_m: door,
      stair_width_m: stairW,
      metrics: metrics.map((m) => ({ label: m.label, value: m.value })),
    },
    ['building_plan', 'fire_protection_design.egress'],
    { unit: 'm|count' }
  );
}

export function resolveApplicableCodes(params: {
  data: ProjectEngineeringData;
}): ResolvedField<string[]> {
  const fp = fpFromData(params.data);
  const codes = (fp.applicable_codes || []).map((c) => String(c).trim()).filter(Boolean);
  // Design Center knowledge_links are project references only — not authoritative applicable codes
  if (!codes.length) {
    return missing(
      ['fire_protection_design.applicable_codes'],
      'Applicable codes list missing on fire protection design'
    );
  }
  return valid(codes, ['fire_protection_design.applicable_codes']);
}

/**
 * Code edition for authoritative checks.
 * Returns MISSING until the project documents an edition — never invents a year.
 */
export function resolveCodeEdition(params: {
  data: ProjectEngineeringData;
}): ResolvedField<{ source_code: string; source_edition: string }> {
  const snap = params.data.compliance?.approved_snapshot;
  if (snap?.code_edition && snap?.source_code) {
    return valid(
      { source_code: snap.source_code, source_edition: snap.code_edition },
      ['compliance.approved_snapshot'],
      { edition: snap.code_edition, code_ref: snap.source_code }
    );
  }
  const notes = text(params.data.compliance?.notes);
  // Explicit "CODE=…; EDITION=…" in compliance notes if engineer documented it
  if (notes) {
    const m = notes.match(/CODE\s*=\s*([^;]+);\s*EDITION\s*=\s*([^;]+)/i);
    if (m) {
      return valid(
        { source_code: m[1].trim(), source_edition: m[2].trim() },
        ['compliance.notes'],
        { edition: m[2].trim(), code_ref: m[1].trim() }
      );
    }
  }
  return missing(
    ['compliance.approved_snapshot', 'compliance.notes'],
    'Code edition not documented — numeric PASS requires verified edition (do not invent)'
  );
}

export function resolveFireProtectionDesignOrMissing(params: {
  data: ProjectEngineeringData;
}): ResolvedField<FireProtectionDesign> {
  if (!params.data.fire_protection_design) {
    return missing(['fire_protection_design'], 'Fire protection design missing');
  }
  return valid(fpFromData(params.data), ['fire_protection_design']);
}

/** Aggregate helper used by buildComplianceContext. */
export type EngineeringResolverBundle = {
  occupancy: ResolvedField<string>;
  buildingType: ResolvedField<string>;
  constructionType: ResolvedField<string>;
  floorAreas: ReturnType<typeof resolveFloorAreas>;
  zones: ReturnType<typeof resolveZones>;
  floorsCount: ResolvedField<number>;
  buildingHeightM: ResolvedField<number>;
  fireAreaM2: ResolvedField<number>;
  pump: ReturnType<typeof resolvePump>;
  tank: ReturnType<typeof resolveTank>;
  egress: ReturnType<typeof resolveEgressData>;
  applicableCodes: ResolvedField<string[]>;
  codeEdition: ReturnType<typeof resolveCodeEdition>;
};

export function resolveEngineeringFields(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
}): EngineeringResolverBundle {
  return {
    occupancy: resolveOccupancy(params),
    buildingType: resolveBuildingType(params),
    constructionType: resolveConstructionType(params),
    floorAreas: resolveFloorAreas(params),
    zones: resolveZones(params),
    floorsCount: resolveNumberOfFloors(params),
    buildingHeightM: resolveBuildingHeightM(params),
    fireAreaM2: resolveFireAreaM2(params),
    pump: resolvePump(params),
    tank: resolveTank(params),
    egress: resolveEgressData(params),
    applicableCodes: resolveApplicableCodes(params),
    codeEdition: resolveCodeEdition(params),
  };
}

export function resolverBlocksAuthoritativePass(field: ResolvedField<unknown>): boolean {
  return field.state === 'MISSING' || field.state === 'INVALID' || field.state === 'CONFLICT';
}
