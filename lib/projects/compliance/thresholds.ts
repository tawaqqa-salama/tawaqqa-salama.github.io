/**
 * Documented compliance thresholds ONLY from in-repo sources.
 * If a numeric code limit is not documented for the project condition → null
 * (caller must return NEEDS_DATA — never invent numbers).
 */

import { SBC_OCCUPANCIES, type SbcOccupancyCode } from '@/lib/constants/sbc801';
import { sbc801TravelDistanceLimit } from '@/lib/projects/design-center/vision/egressEngine';
import type { ComplianceRuleContext } from '@/lib/projects/compliance/types';

export type ResolvedThreshold = {
  value: number;
  unit: string;
  code_reference: string;
  condition: string;
  source: string;
};

/**
 * Platform exit-count bands used by sbc-classification / SBC-201-1004 cards.
 * Requires known occupancy classification — never applied without occupancy context.
 * Ref: SBC 201 §1006 (number of exits) / platform proof card SBC-201-1004.
 */
export function requiredExitsFromOccupantLoad(
  occupants: number,
  occupancy: { code?: string | null; group?: string | null; classification?: string | null } | null | undefined
): { required: number; code_reference: string; condition: string } | null {
  if (!Number.isFinite(occupants) || occupants < 0) return null;
  const hasOcc =
    Boolean(occupancy?.code) ||
    Boolean(occupancy?.group) ||
    Boolean(String(occupancy?.classification || '').trim());
  if (!hasOcc) return null;

  let required: number;
  if (occupants <= 49) required = 1;
  else if (occupants <= 500) required = 2;
  else required = Math.max(3, Math.ceil(occupants / 500) + 1);

  const occLabel =
    occupancy?.code ||
    (occupancy?.group ? `GROUP ${occupancy.group}` : null) ||
    occupancy?.classification ||
    'classified';

  return {
    required,
    code_reference: 'SBC 201 §1006 / SBC-201-1004',
    condition: `occupant_load=${occupants}; occupancy=${occLabel}; bands≤49→1, ≤500→2, else max(3, ceil(n/500)+1)`,
  };
}

/** Travel distance max from in-repo SBC 801 heuristic table — only with occupancy + sprinkler known. */
export function resolveTravelDistanceLimitM(
  ctx: ComplianceRuleContext
): ResolvedThreshold | null {
  const occ =
    ctx.building.primary_occupancy_code ||
    ctx.building.occupancy_classification ||
    ctx.building.group_letter;
  if (!occ) return null;

  const spr = ctx.fireProtection.sprinkler_provided;
  if (spr !== 'yes' && spr !== 'no') return null;

  const limit = sbc801TravelDistanceLimit({
    hasSprinkler: spr === 'yes',
    occupancy: String(occ),
  });

  return {
    value: limit.applied_max_m,
    unit: 'm',
    code_reference: `${limit.code} travel-distance table (platform heuristic — verify adopted edition)`,
    condition: `occupancy=${occ}; sprinkler=${spr}; applied_max=${limit.applied_max_m}m (${limit.max_m_without_sprinkler}/${limit.max_m_with_sprinkler})`,
    source: 'lib/projects/design-center/vision/egressEngine.ts#sbc801TravelDistanceLimit',
  };
}

/**
 * Exit separation minimum — not automated in-repo without engineer-documented required value.
 * SBC 201 §1007 typically uses diagonal/remote rules; we do not invent the formula here.
 */
export function resolveExitSeparationMinM(
  ctx: ComplianceRuleContext
): ResolvedThreshold | null {
  const req = ctx.egress.required_exit_separation_m;
  if (req == null || !Number.isFinite(req) || req <= 0) return null;
  const occ =
    ctx.building.primary_occupancy_code ||
    ctx.building.occupancy_classification ||
    ctx.building.group_letter;
  if (!occ) return null;
  const spr = ctx.fireProtection.sprinkler_provided;
  if (spr !== 'yes' && spr !== 'no') return null;

  return {
    value: req,
    unit: 'm',
    code_reference: 'SBC 201 §1007 (engineer-documented required separation for this occupancy/protection)',
    condition: `occupancy=${occ}; sprinkler=${spr}; required_exit_separation_m=${req}`,
    source: 'project egress.required_exit_separation_m',
  };
}

export function resolveCorridorMinWidthM(ctx: ComplianceRuleContext): ResolvedThreshold | null {
  const req = ctx.egress.required_corridor_width_m;
  if (req == null || !Number.isFinite(req) || req <= 0) return null;
  return {
    value: req,
    unit: 'm',
    code_reference: 'SBC 201 §1020 (engineer-documented required corridor width)',
    condition: `required_corridor_width_m=${req}`,
    source: 'project egress.required_corridor_width_m',
  };
}

export function resolveDoorMinWidthM(ctx: ComplianceRuleContext): ResolvedThreshold | null {
  const req = ctx.egress.required_door_width_m;
  if (req == null || !Number.isFinite(req) || req <= 0) return null;
  return {
    value: req,
    unit: 'm',
    code_reference: 'SBC 201 §1010 (engineer-documented required door width)',
    condition: `required_door_width_m=${req}`,
    source: 'project egress.required_door_width_m',
  };
}

export function resolveStairMinWidthM(ctx: ComplianceRuleContext): ResolvedThreshold | null {
  const req = ctx.egress.required_stair_width_m;
  if (req == null || !Number.isFinite(req) || req <= 0) return null;
  return {
    value: req,
    unit: 'm',
    code_reference: 'SBC 201 §1011 (engineer-documented required stair width)',
    condition: `required_stair_width_m=${req}`,
    source: 'project egress.required_stair_width_m',
  };
}

/**
 * Fire apparatus access width — only when project documents required width + code ref.
 * No invented “common 6 m” threshold.
 */
export function resolveFireAccessMinWidthM(
  ctx: ComplianceRuleContext
): ResolvedThreshold | null {
  const req = ctx.fireAccess.required_road_width_m;
  const ref = ctx.fireAccess.required_road_width_code_ref;
  if (req == null || !Number.isFinite(req) || req <= 0) return null;
  if (!ref || String(ref).trim().length < 3) return null;
  return {
    value: req,
    unit: 'm',
    code_reference: String(ref).trim(),
    condition: `required_road_width_m=${req}`,
    source: 'project fireAccess.required_road_width_m + code_ref',
  };
}

export function occupancyLabel(ctx: ComplianceRuleContext): string | null {
  if (ctx.building.primary_occupancy_code) {
    const code = ctx.building.primary_occupancy_code as SbcOccupancyCode;
    const def = SBC_OCCUPANCIES[code];
    if (def) return `GROUP ${def.group_letter} — ${def.label_ar}`;
    return ctx.building.primary_occupancy_code;
  }
  return ctx.building.occupancy_classification || (ctx.building.group_letter ? `GROUP ${ctx.building.group_letter}` : null);
}
