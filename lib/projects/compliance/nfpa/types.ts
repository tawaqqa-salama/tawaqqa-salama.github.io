/**
 * NFPA Engineering Architecture — Phase 1 (architecture first).
 *
 * AUTHORITY: Findings from this module feed lib/projects/compliance only.
 * AI / Vision / DI / soft lib/compliance / calculation estimates are ADVISORY
 * and must never create PASS or unlock workflow stages.
 *
 * Do NOT invent NFPA edition years or numeric table cells.
 * Missing edition/table → RULE_NOT_CONFIGURED.
 * Missing canonical input → NEEDS_DATA.
 * Conflicting canonical sources → CONFLICT.
 */

import type { ResolverState } from '@/lib/projects/compliance/resolvers';

export type NfpaStandardCode =
  | 'NFPA-13'
  | 'NFPA-20'
  | 'NFPA-22'
  | 'NFPA-72'
  | 'NFPA-101';

/**
 * NFPA-specific statuses. Mapped into ComplianceResultStatus when registered
 * as ComplianceRule evaluations.
 */
export type NfpaRuleStatus =
  | 'PASS'
  | 'FAIL'
  | 'NEEDS_DATA'
  | 'CONFLICT'
  | 'RULE_NOT_CONFIGURED'
  | 'N/A';

export type NfpaRuleFinding = {
  code: NfpaStandardCode;
  /** null until project documents an adopted edition — never invented */
  edition: string | null;
  rule_id: string;
  field: string;
  status: NfpaRuleStatus;
  actual_value: string | number | boolean | null;
  required_value: string | number | boolean | null;
  unit: string | null;
  explanation_ar: string;
  explanation_en: string;
  source: string;
  authoritative: true;
  /** Resolver state for the primary input field, when applicable */
  input_state?: ResolverState | null;
};

/** Canonical NFPA 13 domain inputs — resolved from ProjectEngineeringData only. */
export type Nfpa13Context = {
  occupancy: { state: ResolverState; value: string | null };
  hazard_class: { state: ResolverState; value: string | null };
  sprinkler_required: { state: ResolverState; value: 'yes' | 'no' | 'unknown' | null };
  sprinkler_system_type: { state: ResolverState; value: string | null };
  sprinkler_type: { state: ResolverState; value: string | null };
  k_factor: { state: ResolverState; value: number | null };
  design_pressure: { state: ResolverState; value: number | null };
  design_flow_lpm: { state: ResolverState; value: number | null };
  /** Not on FireProtectionDesign today — always MISSING until schema extended */
  design_area_m2: { state: ResolverState; value: number | null };
  density_lpm_m2: { state: ResolverState; value: number | null };
  sprinkler_spacing_m: { state: ResolverState; value: number | null };
  water_demand_lpm: { state: ResolverState; value: number | null };
  hose_allowance_lpm: { state: ResolverState; value: number | null };
  remote_area_m2: { state: ResolverState; value: number | null };
  hydraulic_network_complete: { state: ResolverState; value: boolean | null };
  available_water_supply: { state: ResolverState; value: string | null };
  /** Documented NFPA 13 edition — never invented */
  nfpa13_edition: { state: ResolverState; value: string | null };
};

export type Nfpa20Context = {
  pump_exists: { state: ResolverState; value: 'yes' | 'no' | 'unknown' | null };
  pump_type: { state: ResolverState; value: string | null };
  rated_flow_lpm: { state: ResolverState; value: number | null };
  rated_pressure_bar: { state: ResolverState; value: number | null };
  suction_condition: { state: ResolverState; value: string | null };
  churn_pressure: { state: ResolverState; value: number | null };
  controller_documented: { state: ResolverState; value: boolean | null };
  test_requirements_documented: { state: ResolverState; value: boolean | null };
  nfpa20_edition: { state: ResolverState; value: string | null };
};

export type Nfpa22Context = {
  tank_exists: { state: ResolverState; value: 'yes' | 'no' | 'unknown' | null };
  tank_capacity_m3: { state: ResolverState; value: number | null };
  usable_volume_m3: { state: ResolverState; value: number | null };
  tank_type: { state: ResolverState; value: string | null };
  duration_min: { state: ResolverState; value: number | null };
  fire_demand_lpm: { state: ResolverState; value: number | null };
  calculated_required_m3: { state: ResolverState; value: number | null };
  nfpa22_edition: { state: ResolverState; value: string | null };
};

export type Nfpa72Context = {
  alarm_provided: { state: ResolverState; value: 'yes' | 'no' | 'unknown' | null };
  control_panel: { state: ResolverState; value: string | null };
  initiating_devices: { state: ResolverState; value: string | null };
  notification_appliances: { state: ResolverState; value: string | null };
  manual_call_points: { state: ResolverState; value: string | null };
  supervision_documented: { state: ResolverState; value: boolean | null };
  monitoring_documented: { state: ResolverState; value: boolean | null };
  emergency_power: { state: ResolverState; value: string | null };
  interfaces: { state: ResolverState; value: string | null };
  nfpa72_edition: { state: ResolverState; value: string | null };
};

/**
 * NFPA 101 egress — shares the SAME canonical egress measurements as SBC 201.
 * Separate rule findings; one compliance authority.
 */
export type Nfpa101Context = {
  travel_distance_m: { state: ResolverState; value: number | null };
  common_path_m: { state: ResolverState; value: number | null };
  dead_end_m: { state: ResolverState; value: number | null };
  exits_count: { state: ResolverState; value: number | null };
  corridor_width_m: { state: ResolverState; value: number | null };
  door_width_m: { state: ResolverState; value: number | null };
  stair_width_m: { state: ResolverState; value: number | null };
  occupant_load: { state: ResolverState; value: number | null };
  occupancy: { state: ResolverState; value: string | null };
  nfpa101_edition: { state: ResolverState; value: string | null };
};

export type NfpaEngineeringContext = {
  nfpa13: Nfpa13Context;
  nfpa20: Nfpa20Context;
  nfpa22: Nfpa22Context;
  nfpa72: Nfpa72Context;
  nfpa101: Nfpa101Context;
};

export const NFPA_AUTHORITY = 'lib/projects/compliance/nfpa' as const;

/** Advisory stacks that must never create authoritative NFPA PASS. */
export const NFPA_ADVISORY_SOURCES = [
  'lib/compliance',
  'lib/design-intelligence',
  'lib/projects/design-center/vision',
  'lib/projects/design-center/knowledge-engine',
  'calculation_estimate',
] as const;
