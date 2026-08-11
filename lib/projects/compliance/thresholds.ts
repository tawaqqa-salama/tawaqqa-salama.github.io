/**
 * Documented compliance thresholds ONLY from in-repo sources.
 *
 * Distinction (mandatory):
 * - platform_code_table: numeric/boolean value encoded from EKB / sbc801.ts — may PASS/FAIL
 * - project_design: user/engineer-entered design figure — NEVER treated as automatic "code"
 * - missing: no usable threshold → NEEDS_DATA
 *
 * Never invent generic numbers (e.g. 6 m access width, 45/60 m travel) for automated PASS.
 */

import { SBC_OCCUPANCIES, type SbcOccupancyCode } from '@/lib/constants/sbc801';
import type { ComplianceRuleContext } from '@/lib/projects/compliance/types';
import { citationFor } from '@/lib/projects/compliance/code-refs';

export type ThresholdSourceKind =
  | 'platform_code_table'
  | 'explicit_code_condition'
  | 'project_design'
  | 'missing';

export type ResolvedThreshold = {
  value: number;
  unit: string;
  code_reference: string;
  condition: string;
  source: string;
  /** Who authored this number / how it may be used for PASS/FAIL */
  sourceKind: ThresholdSourceKind;
};

/**
 * Platform exit-count bands used by sbc-classification / SBC-201-1004 cards.
 * Requires known occupancy classification — never applied without occupancy context.
 * Ref: SBC 201 §1006 (number of exits) / platform proof card SBC-201-1004.
 */
export function requiredExitsFromOccupantLoad(
  occupants: number,
  occupancy: { code?: string | null; group?: string | null; classification?: string | null } | null | undefined
): { required: number; code_reference: string; condition: string; sourceKind: 'platform_code_table' } | null {
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
    code_reference: citationFor('EGR-02'),
    condition: `occupant_load=${occupants}; occupancy=${occLabel}; bands≤49→1, ≤500→2, else max(3, ceil(n/500)+1)`,
    sourceKind: 'platform_code_table',
  };
}

/**
 * Travel distance: adopted occupancy tables are NOT fully encoded.
 * Platform 45/60 heuristic must NOT drive automated PASS/FAIL.
 * Returns null → caller NEEDS_DATA (may still show measured actual).
 */
export function resolveTravelDistanceLimitM(
  _ctx?: ComplianceRuleContext
): ResolvedThreshold | null {
  void _ctx;
  // Intentionally null — do not use heuristic 45/60 as code-required.
  return null;
}

/**
 * Project-entered exit separation — informational design figure only.
 * Never sourceKind=platform_code_table (user entry ≠ automatic code).
 */
export function resolveExitSeparationMinM(
  ctx: ComplianceRuleContext
): ResolvedThreshold | null {
  const req = ctx.egress.required_exit_separation_m;
  if (req == null || !Number.isFinite(req) || req <= 0) return null;
  return {
    value: req,
    unit: 'm',
    code_reference: `${citationFor('EGR-05')} [project_design value — not auto code]`,
    condition: `project_design required_exit_separation_m=${req}`,
    source: 'project egress.required_exit_separation_m',
    sourceKind: 'project_design',
  };
}

export function resolveCorridorMinWidthM(ctx: ComplianceRuleContext): ResolvedThreshold | null {
  const req = ctx.egress.required_corridor_width_m;
  if (req == null || !Number.isFinite(req) || req <= 0) return null;
  return {
    value: req,
    unit: 'm',
    code_reference: `${citationFor('EGR-09')} [project_design value — not auto code]`,
    condition: `project_design required_corridor_width_m=${req}`,
    source: 'project egress.required_corridor_width_m',
    sourceKind: 'project_design',
  };
}

export function resolveDoorMinWidthM(ctx: ComplianceRuleContext): ResolvedThreshold | null {
  const req = ctx.egress.required_door_width_m;
  if (req == null || !Number.isFinite(req) || req <= 0) return null;
  return {
    value: req,
    unit: 'm',
    code_reference: `${citationFor('EGR-10')} [project_design value — not auto code]`,
    condition: `project_design required_door_width_m=${req}`,
    source: 'project egress.required_door_width_m',
    sourceKind: 'project_design',
  };
}

export function resolveStairMinWidthM(ctx: ComplianceRuleContext): ResolvedThreshold | null {
  const req = ctx.egress.required_stair_width_m;
  if (req == null || !Number.isFinite(req) || req <= 0) return null;
  return {
    value: req,
    unit: 'm',
    code_reference: `${citationFor('EGR-11')} [project_design value — not auto code]`,
    condition: `project_design required_stair_width_m=${req}`,
    source: 'project egress.required_stair_width_m',
    sourceKind: 'project_design',
  };
}

/**
 * Fire apparatus access width — project-entered + free-text ref is still project_design.
 * No invented “common 6 m” platform table.
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
    code_reference: `${String(ref).trim()} [project_design citation — not auto-validated code table]`,
    condition: `project_design required_road_width_m=${req}`,
    source: 'project fireAccess.required_road_width_m + code_ref',
    sourceKind: 'project_design',
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
