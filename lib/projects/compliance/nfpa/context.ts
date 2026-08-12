/**
 * Build NFPA domain contexts from the canonical engineering dataset ONLY.
 *
 * Sources allowed:
 * - ProjectEngineeringData via resolvers (live payload SoT)
 * - FireProtectionDesign measured fields on that dataset
 *
 * Sources forbidden as direct SoT:
 * - CRM-only fields without canonical resolve
 * - vision / DI / estimate outputs
 * - legacy JSON without conflict-aware resolve
 */

import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import { parseNumber } from '@/lib/projects/compliance/evidence';
import {
  resolveEngineeringFields,
  type ResolvedField,
  type ResolverState,
} from '@/lib/projects/compliance/resolvers';
import {
  EMPTY_FIRE_PROTECTION_DESIGN,
  flowToLpm,
  type FireProtectionDesign,
} from '@/lib/types/fire-protection-design';
import type {
  Nfpa101Context,
  Nfpa13Context,
  Nfpa20Context,
  Nfpa22Context,
  Nfpa72Context,
  NfpaEngineeringContext,
} from '@/lib/projects/compliance/nfpa/types';

/** Local FP merge — avoid circular import with compliance/context.ts */
function resolveFireProtectionDesign(
  data: ProjectEngineeringData | null | undefined
): FireProtectionDesign {
  return data?.fire_protection_design
    ? { ...EMPTY_FIRE_PROTECTION_DESIGN, ...data.fire_protection_design }
    : { ...EMPTY_FIRE_PROTECTION_DESIGN };
}

function field<T>(
  state: ResolverState,
  value: T | null,
  message?: string
): { state: ResolverState; value: T | null; message?: string } {
  return { state, value, ...(message ? { message } : {}) };
}

function fromResolved<T>(r: ResolvedField<T>): { state: ResolverState; value: T | null } {
  return { state: r.state, value: r.state === 'VALID' ? r.value : null };
}

function textField(
  raw: unknown,
  sourceState: ResolverState = 'VALID'
): { state: ResolverState; value: string | null } {
  if (sourceState === 'CONFLICT') return field('CONFLICT', null);
  if (sourceState === 'INVALID') return field('INVALID', null);
  const s = String(raw ?? '').trim();
  if (!s) return field('MISSING', null);
  return field('VALID', s);
}

function numField(
  raw: unknown,
  sourceState: ResolverState = 'VALID'
): { state: ResolverState; value: number | null } {
  if (sourceState === 'CONFLICT') return field('CONFLICT', null);
  if (sourceState === 'INVALID') return field('INVALID', null);
  if (raw == null || raw === '') return field('MISSING', null);
  const n = typeof raw === 'number' ? raw : parseNumber(raw);
  if (n == null || !Number.isFinite(n) || n <= 0) {
    if (String(raw).trim()) return field('INVALID', null);
    return field('MISSING', null);
  }
  return field('VALID', n);
}

/** Edition: only from explicit compliance notes CODE=NFPA-*;EDITION=* — never invent. */
function resolveNfpaEdition(
  data: ProjectEngineeringData,
  code: string
): { state: ResolverState; value: string | null } {
  const notes = String(data.compliance?.notes || '');
  const snap = data.compliance?.approved_snapshot;
  if (snap?.source_code && snap.code_edition) {
    if (String(snap.source_code).toUpperCase().includes(code.replace('-', ' '))) {
      return field('VALID', snap.code_edition);
    }
  }
  const re = new RegExp(
    `CODE\\s*=\\s*${code.replace('-', '[- ]?')}[^;]*;\\s*EDITION\\s*=\\s*([^;]+)`,
    'i'
  );
  const m = notes.match(re);
  if (m?.[1]?.trim()) return field('VALID', m[1].trim());
  return field('MISSING', null);
}

export function buildNfpaEngineeringContext(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
}): NfpaEngineeringContext {
  const { data } = params;
  const resolved = resolveEngineeringFields({ client: params.client, data });
  const fp = resolveFireProtectionDesign(data);
  const egressState = resolved.egress.state;
  const egress = egressState === 'VALID' ? resolved.egress.value : null;

  const nfpa13: Nfpa13Context = {
    occupancy: fromResolved(resolved.occupancy),
    hazard_class: textField(fp.occupancy.hazard_class),
    sprinkler_required:
      fp.sprinkler.required === 'yes' ||
      fp.sprinkler.required === 'no' ||
      fp.sprinkler.required === 'unknown'
        ? field('VALID', fp.sprinkler.required)
        : field('MISSING', null),
    sprinkler_system_type: textField(fp.sprinkler.system_type),
    sprinkler_type: textField(fp.sprinkler.sprinkler_type),
    k_factor: numField(fp.sprinkler.k_factor),
    design_pressure: numField(fp.sprinkler.design_pressure),
    design_flow_lpm: numField(fp.sprinkler.design_flow),
    // Schema gap — authoritative density/design area not on FireProtectionDesign yet
    design_area_m2: field('MISSING', null),
    density_lpm_m2: field('MISSING', null),
    sprinkler_spacing_m: field('MISSING', null),
    water_demand_lpm:
      resolved.tank.state === 'VALID' && resolved.tank.value?.demand_lpm != null
        ? field('VALID', resolved.tank.value.demand_lpm)
        : numField(fp.water_tank.water_demand_lpm?.value ?? null),
    hose_allowance_lpm: field('MISSING', null),
    remote_area_m2: (() => {
      const metrics = egressState === 'VALID' ? egress?.metrics || [] : [];
      for (const m of metrics) {
        if (/remote\s*area|منطقة\s*نائية/i.test(m.label)) {
          return numField(m.value, egressState);
        }
      }
      return field('MISSING', null);
    })(),
    hydraulic_network_complete: field(
      'MISSING',
      null
    ), // set below after hyd check via design fields
    available_water_supply: textField(fp.water_supply?.water_source),
    nfpa13_edition: resolveNfpaEdition(data, 'NFPA-13'),
  };

  // Hydraulic completeness from documented FP sprinkler + pump fields (not estimates)
  {
    const complete = Boolean(
      nfpa13.k_factor.state === 'VALID' &&
        nfpa13.design_flow_lpm.state === 'VALID' &&
        nfpa13.design_pressure.state === 'VALID' &&
        resolved.pump.state === 'VALID' &&
        resolved.pump.value?.flow_lpm != null &&
        resolved.pump.value?.pressure_bar != null
    );
    nfpa13.hydraulic_network_complete = complete
      ? field('VALID', true)
      : field('MISSING', null);
  }

  const nfpa20: Nfpa20Context = {
    pump_exists:
      resolved.pump.state === 'VALID'
        ? resolved.pump.value?.exists === 'yes' ||
          resolved.pump.value?.exists === 'no' ||
          resolved.pump.value?.exists === 'unknown'
          ? field('VALID', resolved.pump.value.exists)
          : field('MISSING', null)
        : field(
            resolved.pump.state === 'CONFLICT'
              ? 'CONFLICT'
              : resolved.pump.state === 'INVALID'
                ? 'INVALID'
                : 'MISSING',
            null
          ),
    pump_type: textField(fp.pump.type || null),
    rated_flow_lpm:
      resolved.pump.state === 'VALID' && resolved.pump.value?.flow_lpm != null
        ? field('VALID', resolved.pump.value.flow_lpm)
        : field(
            resolved.pump.state === 'CONFLICT'
              ? 'CONFLICT'
              : resolved.pump.state === 'INVALID'
                ? 'INVALID'
                : 'MISSING',
            null
          ),
    rated_pressure_bar:
      resolved.pump.state === 'VALID' && resolved.pump.value?.pressure_bar != null
        ? field('VALID', resolved.pump.value.pressure_bar)
        : field(
            resolved.pump.state === 'CONFLICT'
              ? 'CONFLICT'
              : resolved.pump.state === 'INVALID'
                ? 'INVALID'
                : 'MISSING',
            null
          ),
    suction_condition: field('MISSING', null),
    churn_pressure: field('MISSING', null),
    controller_documented: field('MISSING', null),
    test_requirements_documented: field('MISSING', null),
    nfpa20_edition: resolveNfpaEdition(data, 'NFPA-20'),
  };

  // Prefer measured rated_flow over capacity when both present on FP
  if (nfpa20.rated_flow_lpm.state !== 'VALID') {
    const rated = flowToLpm(fp.pump.rated_flow);
    if (rated != null) nfpa20.rated_flow_lpm = field('VALID', rated);
  }

  const nfpa22: Nfpa22Context = {
    tank_exists:
      resolved.tank.state === 'VALID'
        ? resolved.tank.value?.exists === 'yes' ||
          resolved.tank.value?.exists === 'no' ||
          resolved.tank.value?.exists === 'unknown'
          ? field('VALID', resolved.tank.value.exists)
          : field('MISSING', null)
        : field(
            resolved.tank.state === 'CONFLICT'
              ? 'CONFLICT'
              : resolved.tank.state === 'INVALID'
                ? 'INVALID'
                : 'MISSING',
            null
          ),
    tank_capacity_m3:
      resolved.tank.state === 'VALID' && resolved.tank.value?.capacity_m3 != null
        ? field('VALID', resolved.tank.value.capacity_m3)
        : field(
            resolved.tank.state === 'CONFLICT'
              ? 'CONFLICT'
              : resolved.tank.state === 'INVALID'
                ? 'INVALID'
                : 'MISSING',
            null
          ),
    usable_volume_m3: field('MISSING', null),
    tank_type: textField(fp.water_supply?.tank_type || null),
    duration_min:
      resolved.tank.state === 'VALID' && resolved.tank.value?.duration_min != null
        ? field('VALID', resolved.tank.value.duration_min)
        : field(
            resolved.tank.state === 'CONFLICT'
              ? 'CONFLICT'
              : resolved.tank.state === 'INVALID'
                ? 'INVALID'
                : 'MISSING',
            null
          ),
    fire_demand_lpm:
      resolved.tank.state === 'VALID' && resolved.tank.value?.demand_lpm != null
        ? field('VALID', resolved.tank.value.demand_lpm)
        : field(
            resolved.tank.state === 'CONFLICT'
              ? 'CONFLICT'
              : resolved.tank.state === 'INVALID'
                ? 'INVALID'
                : 'MISSING',
            null
          ),
    calculated_required_m3:
      resolved.tank.state === 'VALID' && resolved.tank.value?.required_m3 != null
        ? field('VALID', resolved.tank.value.required_m3)
        : field(
            resolved.tank.state === 'CONFLICT'
              ? 'CONFLICT'
              : resolved.tank.state === 'INVALID'
                ? 'INVALID'
                : 'MISSING',
            null
          ),
    nfpa22_edition: resolveNfpaEdition(data, 'NFPA-22'),
  };

  const alarm = fp.fire_alarm;
  const nfpa72: Nfpa72Context = {
    alarm_provided: (() => {
      const yn = String(data.building_plan?.fire_alarm_system || '').trim();
      if (yn === 'نعم') return field('VALID', 'yes' as const);
      if (yn === 'لا') return field('VALID', 'no' as const);
      return field('MISSING', null);
    })(),
    control_panel: textField(alarm?.control_panel),
    initiating_devices: textField(
      [alarm?.smoke_detectors, alarm?.heat_detectors].filter(Boolean).join(' / ') || null
    ),
    notification_appliances: textField(
      [alarm?.bells, alarm?.voice_alarm].filter(Boolean).join(' / ') || null
    ),
    manual_call_points: textField(alarm?.manual_call_points),
    supervision_documented: field('MISSING', null),
    monitoring_documented: field('MISSING', null),
    emergency_power: textField(fp.supporting_systems?.emergency_power?.status || null),
    interfaces: textField(alarm?.integration),
    nfpa72_edition: resolveNfpaEdition(data, 'NFPA-72'),
  };

  const nfpa101: Nfpa101Context = {
    travel_distance_m:
      egressState === 'VALID'
        ? field('VALID', egress?.travel_distance_m ?? null)
        : field(
            egressState === 'CONFLICT'
              ? 'CONFLICT'
              : egressState === 'INVALID'
                ? 'INVALID'
                : 'MISSING',
            null
          ),
    common_path_m:
      egressState === 'VALID'
        ? field('VALID', egress?.common_path_m ?? null)
        : field(egressState === 'CONFLICT' ? 'CONFLICT' : egressState === 'INVALID' ? 'INVALID' : 'MISSING', null),
    dead_end_m:
      egressState === 'VALID'
        ? field('VALID', egress?.dead_end_m ?? null)
        : field(egressState === 'CONFLICT' ? 'CONFLICT' : egressState === 'INVALID' ? 'INVALID' : 'MISSING', null),
    exits_count:
      egressState === 'VALID'
        ? field('VALID', egress?.exits_count ?? null)
        : field(egressState === 'CONFLICT' ? 'CONFLICT' : egressState === 'INVALID' ? 'INVALID' : 'MISSING', null),
    corridor_width_m:
      egressState === 'VALID'
        ? field('VALID', egress?.corridor_width_m ?? null)
        : field(egressState === 'CONFLICT' ? 'CONFLICT' : egressState === 'INVALID' ? 'INVALID' : 'MISSING', null),
    door_width_m:
      egressState === 'VALID'
        ? field('VALID', egress?.door_width_m ?? null)
        : field(egressState === 'CONFLICT' ? 'CONFLICT' : egressState === 'INVALID' ? 'INVALID' : 'MISSING', null),
    stair_width_m:
      egressState === 'VALID'
        ? field('VALID', egress?.stair_width_m ?? null)
        : field(egressState === 'CONFLICT' ? 'CONFLICT' : egressState === 'INVALID' ? 'INVALID' : 'MISSING', null),
    occupant_load: (() => {
      // Occupant load from zones only when zones VALID — never invent
      if (resolved.zones.state !== 'VALID' || !resolved.zones.value?.length) {
        return field(
          resolved.zones.state === 'CONFLICT'
            ? 'CONFLICT'
            : resolved.zones.state === 'INVALID'
              ? 'INVALID'
              : 'MISSING',
          null
        );
      }
      const total = resolved.zones.value.reduce((s, z) => s + (z.occupant_load || 0), 0);
      return total > 0 ? field('VALID', total) : field('MISSING', null);
    })(),
    occupancy: fromResolved(resolved.occupancy),
    nfpa101_edition: resolveNfpaEdition(data, 'NFPA-101'),
  };

  return { nfpa13, nfpa20, nfpa22, nfpa72, nfpa101 };
}
