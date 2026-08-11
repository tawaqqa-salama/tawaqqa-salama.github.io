/**
 * Structured code / rule matrix database for Compliance Engine.
 *
 * IMPORTANT:
 * - No invented numeric thresholds.
 * - Engine logic must call this module (or project-documented mappings) —
 *   never hard-code SBC/NFPA numbers inside engine.ts.
 * - A row may be PASS/FAIL only when a numeric threshold is encoded here
 *   with edition + section (+ table when applicable), OR when the project
 *   supplies a fully documented adopted mapping (edition + section + value).
 * - Unencoded mappings → BLOCKED (CODE_REFERENCE_REQUIRED), never PASS.
 */

export type SprinklerStatus = 'sprinklered' | 'non_sprinklered';

export type FireClass = 'A' | 'B' | 'C' | 'D' | 'K';

/** Fully traced numeric limit — required for automated PASS/FAIL */
export type DocumentedCodeLimit = {
  value: number;
  unit: string;
  source_code: string;
  source_edition: string;
  source_section: string;
  source_table?: string | null;
  /** Free-text applicability note (occupancy / hazard / sprinkler) */
  applicability?: string | null;
  occupancy?: string | null;
  sprinkler_status?: SprinklerStatus | null;
  hazard?: string | null;
  fire_class?: FireClass | null;
  /** Where this row was authored */
  encoding_source: 'platform_code_table' | 'project_adopted_mapping';
};

export type RuleMatrixDefinition = {
  rule_id: string;
  domain: 'egress' | 'fire_access' | 'fire_protection';
  source_code: string;
  /** Expected edition for mapping (not a numeric threshold) */
  source_edition: string | null;
  source_section: string;
  source_table: string | null;
  occupancy: string | null;
  sprinkler_status: SprinklerStatus | 'any' | null;
  required_inputs: string[];
  calculation_method: string;
  threshold_source: string;
  pass_condition: string;
  fail_condition: string;
  needs_data_condition: string;
  blocked_condition: string;
  evidence_required: string[];
  /**
   * Linked existing FAC-* citations in RULE_CODE_REFS (never invent FAC codes).
   * Used by FAC-CLEARANCE / FAC-TURNING.
   */
  linked_project_fac_rules?: string[];
  /**
   * Platform-encoded numeric rows. Empty until a verified edition+table cell
   * is entered by maintainers — do not copy unverified internet values.
   */
  encoded_thresholds: DocumentedCodeLimit[];
};

/**
 * Matrix catalog — structural metadata + (currently empty) numeric cells.
 * SBC 201 edition 2024 is the declared architectural MoE authority.
 * NFPA 13 / 10 / 14 are complementary system standards when SBC/AHJ points to them.
 */
export const RULE_MATRIX: RuleMatrixDefinition[] = [
  {
    rule_id: 'EGR-TRAVEL-DISTANCE',
    domain: 'egress',
    source_code: 'SBC 201',
    source_edition: '2024',
    source_section: '1017',
    source_table: 'Table 1017.2 (adopted edition — cells not encoded in platform)',
    occupancy: null,
    sprinkler_status: 'any',
    required_inputs: [
      'occupancy_classification',
      'sprinkler_status',
      'travel_distance_m',
      'path_geometry_documented',
      'applicable_code_mapping',
    ],
    calculation_method: 'compare measured travel distance (m) to occupancy+sprinkler row in SBC 201 §1017 table',
    threshold_source: 'SBC 201:2024 §1017 / Table 1017.2 when encoded OR project_adopted_mapping with edition+section',
    pass_condition: 'measured_travel_distance_m <= required_limit_m with complete mapping',
    fail_condition: 'measured_travel_distance_m > required_limit_m with complete mapping',
    needs_data_condition: 'any required input missing (occupancy, sprinkler_status, measured distance, path geometry)',
    blocked_condition: 'inputs complete but no encoded/project-adopted code mapping for the occupancy+sprinkler case',
    evidence_required: ['measurement', 'drawing', 'document'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'EGR-COMMON-PATH',
    domain: 'egress',
    source_code: 'SBC 201',
    source_edition: '2024',
    source_section: '1016.2',
    source_table: null,
    occupancy: null,
    sprinkler_status: 'any',
    required_inputs: ['occupancy_classification', 'sprinkler_status', 'common_path_m', 'applicable_code_mapping'],
    calculation_method: 'compare measured common path (m) to occupancy+sprinkler limit from SBC 201 §1016.2',
    threshold_source: 'SBC 201:2024 §1016.2 when encoded OR project_adopted_mapping',
    pass_condition: 'common_path_m <= required_limit_m',
    fail_condition: 'common_path_m > required_limit_m',
    needs_data_condition: 'occupancy, sprinkler_status, or common_path_m missing',
    blocked_condition: 'inputs complete; no applicable code row encoded',
    evidence_required: ['measurement', 'drawing'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'EGR-DEAD-END',
    domain: 'egress',
    source_code: 'SBC 201',
    source_edition: '2024',
    source_section: '1020.4',
    source_table: null,
    occupancy: null,
    sprinkler_status: 'any',
    required_inputs: ['occupancy_classification', 'sprinkler_status', 'dead_end_m', 'applicable_code_mapping'],
    calculation_method: 'compare dead-end length (m) to occupancy-specific SBC 201 §1020.4 limit (no universal value)',
    threshold_source: 'SBC 201:2024 §1020.4 when encoded OR project_adopted_mapping',
    pass_condition: 'dead_end_m <= required_limit_m',
    fail_condition: 'dead_end_m > required_limit_m',
    needs_data_condition: 'occupancy, sprinkler_status, or dead_end_m missing',
    blocked_condition: 'inputs complete; no occupancy-specific code row',
    evidence_required: ['measurement', 'drawing'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'EGR-CORRIDOR-WIDTH',
    domain: 'egress',
    source_code: 'SBC 201',
    source_edition: '2024',
    source_section: '1020.2',
    source_table: null,
    occupancy: null,
    sprinkler_status: null,
    required_inputs: [
      'occupant_load_served',
      'occupancy_classification',
      'corridor_type',
      'corridor_clear_width_m',
      'applicable_code_mapping',
    ],
    calculation_method: 'compare net clear corridor width (not nominal architectural width) to SBC 201 §1020.2 requirement',
    threshold_source: 'SBC 201:2024 §1020.2 when encoded OR project_adopted_mapping',
    pass_condition: 'corridor_clear_width_m >= required_clear_width_m',
    fail_condition: 'corridor_clear_width_m < required_clear_width_m',
    needs_data_condition: 'occupant load, occupancy, corridor type, or clear width missing',
    blocked_condition: 'inputs complete; no clear-width code mapping',
    evidence_required: ['measurement', 'drawing'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'EGR-DOOR-WIDTH',
    domain: 'egress',
    source_code: 'SBC 201',
    source_edition: '2024',
    source_section: '1010.1.1',
    source_table: null,
    occupancy: null,
    sprinkler_status: null,
    required_inputs: [
      'occupant_load_served',
      'door_type',
      'door_clear_opening_width_m',
      'door_egress_direction',
      'applicable_code_mapping',
    ],
    calculation_method: 'compare clear opening width (not leaf width alone) to SBC 201 §1010.1.1',
    threshold_source: 'SBC 201:2024 §1010.1.1 when encoded OR project_adopted_mapping',
    pass_condition: 'door_clear_opening_width_m >= required_clear_opening_m',
    fail_condition: 'door_clear_opening_width_m < required_clear_opening_m',
    needs_data_condition: 'occupant load, door type, clear opening, or egress direction missing',
    blocked_condition: 'inputs complete; no clear-opening code mapping',
    evidence_required: ['measurement', 'drawing'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'EGR-STAIR-WIDTH',
    domain: 'egress',
    source_code: 'SBC 201',
    source_edition: '2024',
    source_section: '1011.2',
    source_table: null,
    occupancy: null,
    sprinkler_status: null,
    required_inputs: [
      'occupant_load_served',
      'stairs_count',
      'stair_clear_width_m',
      'occupancy_classification',
      'applicable_code_mapping',
    ],
    calculation_method: 'compare stair clear width to occupancy-specific SBC 201 §1011.2 requirement',
    threshold_source: 'SBC 201:2024 §1011.2 when encoded OR project_adopted_mapping',
    pass_condition: 'stair_clear_width_m >= required_stair_clear_width_m',
    fail_condition: 'stair_clear_width_m < required_stair_clear_width_m',
    needs_data_condition: 'occupant load, stairs count, clear width, or occupancy missing',
    blocked_condition: 'inputs complete; no occupancy stair-width mapping',
    evidence_required: ['measurement', 'drawing'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'FAC-CLEARANCE',
    domain: 'fire_access',
    source_code: 'SBC 801',
    source_edition: null,
    source_section: 'Fire apparatus access clearance / staging (see linked FAC-03)',
    source_table: null,
    occupancy: null,
    sprinkler_status: null,
    required_inputs: [
      'element_type',
      'required_clearance_m',
      'measured_clearance_m',
      'accessible_route_status',
      'obstruction_geometry',
      'applicable_code_mapping',
    ],
    calculation_method: 'compare measured clearance to required clearance from adopted SBC 801 / AHJ mapping',
    threshold_source: 'project code database / linked FAC-03 citation — no invented FAC codes',
    pass_condition: 'measured_clearance_m >= required_clearance_m with complete mapping',
    fail_condition: 'measured_clearance_m < required_clearance_m with complete mapping',
    needs_data_condition: 'element type, clearances, route status, or obstruction geometry missing',
    blocked_condition: 'CODE_REFERENCE_REQUIRED — no numeric FAC clearance mapping in project code database',
    evidence_required: ['measurement', 'drawing'],
    linked_project_fac_rules: ['FAC-03'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'FAC-TURNING',
    domain: 'fire_access',
    source_code: 'SBC 801',
    source_edition: null,
    source_section: 'Turning radius / access geometry (see linked FAC-04)',
    source_table: null,
    occupancy: null,
    sprinkler_status: null,
    required_inputs: [
      'element_type',
      'turning_space_dimensions',
      'measured_clearance_m',
      'required_clearance_m',
      'obstruction_geometry',
      'applicable_code_mapping',
    ],
    calculation_method: 'compare turning-space / measured geometry to required apparatus turning mapping',
    threshold_source: 'project code database / linked FAC-04 citation — no invented FAC codes',
    pass_condition: 'turning geometry meets required mapping',
    fail_condition: 'turning geometry below required mapping',
    needs_data_condition: 'turning dimensions, element type, or required/measured values missing',
    blocked_condition: 'CODE_REFERENCE_REQUIRED — no numeric FAC turning mapping in project code database',
    evidence_required: ['measurement', 'drawing'],
    linked_project_fac_rules: ['FAC-04'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'FP-SPRINKLER-DENSITY',
    domain: 'fire_protection',
    source_code: 'NFPA 13',
    source_edition: null,
    source_section: 'Density/Area (occupancy/hazard tables per adopted edition)',
    source_table: null,
    occupancy: null,
    sprinkler_status: null,
    required_inputs: [
      'hazard_classification',
      'commodity',
      'sprinkler_type',
      'k_factor',
      'design_density_lpm_m2',
      'design_area_m2',
      'sprinkler_count',
      'ceiling_installation_conditions',
      'applicable_nfpa13_mapping',
    ],
    calculation_method: 'design_density_lpm_m2 >= required_density from applicable NFPA 13 table/section for hazard',
    threshold_source: 'NFPA 13 adopted edition density/area table when encoded OR project_adopted_mapping — no generic density hard-code',
    pass_condition: 'hazard+table known AND design_density >= required_density AND supporting inputs complete',
    fail_condition: 'design_density < required_density with complete mapping',
    needs_data_condition: 'hazard, sprinkler type, K-factor, density, area, count, or ceiling conditions missing',
    blocked_condition: 'inputs complete; density row not encoded for hazard/commodity',
    evidence_required: ['calculation', 'document'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'FP-HOSE-ALLOWANCE',
    domain: 'fire_protection',
    source_code: 'NFPA 13',
    source_edition: null,
    source_section: 'Hose stream allowance tables (adopted edition)',
    source_table: null,
    occupancy: null,
    sprinkler_status: null,
    required_inputs: [
      'sprinkler_design_method',
      'sprinkler_type',
      'design_area_m2',
      'hazard_or_commodity',
      'sprinkler_count',
      'nfpa_edition',
      'applicable_hose_table',
    ],
    calculation_method: 'extract hose stream allowance from applicable NFPA 13 table row — never use a generic 250/500 gpm default',
    threshold_source: 'NFPA 13 hose allowance table cell for the design method/hazard when encoded OR project_adopted_mapping',
    pass_condition: 'documented_hose_allowance_lpm equals mapped table allowance (design consistency)',
    fail_condition: 'documented_hose_allowance_lpm differs from mapped table allowance',
    needs_data_condition: 'design method, type, area, hazard, edition, or table identity missing',
    blocked_condition: 'inputs present; correct hose table row cannot be resolved',
    evidence_required: ['calculation', 'document'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'FP-FIRE-WATER-TANK',
    domain: 'fire_protection',
    source_code: 'NFPA 22',
    source_edition: null,
    source_section: 'Water supply duration / usable fire volume (with SBC 801 / AHJ as primary when adopted)',
    source_table: null,
    occupancy: null,
    sprinkler_status: null,
    required_inputs: [
      'hydraulic_demand_lpm',
      'hose_allowance_lpm',
      'standpipe_demand_lpm',
      'duration_min',
      'other_required_fire_demand_lpm',
      'usable_tank_volume_m3',
      'tank_reserve_or_dedicated_fire_volume_m3',
      'applicable_code_mapping',
    ],
    calculation_method:
      'required_volume_m3 = (sum of applicable demands_lpm) × duration_min / 1000; compare usable dedicated fire volume — add demand components only when required by mapping',
    threshold_source: 'duration + demand components from adopted code/standard mapping — no fixed tank size',
    pass_condition: 'usable dedicated fire volume >= calculated required volume with complete mapping',
    fail_condition: 'usable dedicated fire volume < calculated required volume',
    needs_data_condition: 'any required demand, duration, or usable volume missing',
    blocked_condition: 'inputs incomplete for formula OR duration/demand mapping not encoded',
    evidence_required: ['calculation', 'document'],
    encoded_thresholds: [],
  },
  {
    rule_id: 'FP-EXTINGUISHER',
    domain: 'fire_protection',
    source_code: 'NFPA 10',
    source_edition: null,
    source_section: 'Portable extinguishers — class-specific placement / rating / travel',
    source_table: null,
    occupancy: null,
    sprinkler_status: null,
    required_inputs: [
      'fire_class',
      'hazard_level',
      'extinguisher_rating',
      'floor_area_m2',
      'travel_distance_m',
      'extinguisher_count',
      'special_hazards',
      'cooking_hazard',
      'applicable_nfpa10_mapping',
    ],
    calculation_method:
      'class-specific evaluation (A/B/D/K sizing; C is not an independent sizing class) vs NFPA 10 table/section — never a universal 75 ft travel default',
    threshold_source: 'NFPA 10 adopted edition class tables when encoded OR project_adopted_mapping',
    pass_condition: 'rating, count, and travel satisfy mapped class-specific requirements',
    fail_condition: 'rating, count, or travel fails mapped class-specific requirements',
    needs_data_condition: 'fire class, hazard, rating, area, travel, count, or special/cooking flags missing',
    blocked_condition: 'inputs complete; class-specific NFPA 10 row not encoded',
    evidence_required: ['document', 'drawing'],
    encoded_thresholds: [],
  },
];

export function getRuleMatrixDefinition(ruleId: string): RuleMatrixDefinition | undefined {
  return RULE_MATRIX.find((r) => r.rule_id === ruleId);
}

export function listRuleMatrixIds(): string[] {
  return RULE_MATRIX.map((r) => r.rule_id);
}

/** True when a documented limit has enough provenance for PASS/FAIL. */
export function isCompleteCodeMapping(limit: DocumentedCodeLimit | null | undefined): boolean {
  if (!limit) return false;
  if (!(limit.value > 0) || !Number.isFinite(limit.value)) return false;
  if (!String(limit.unit || '').trim()) return false;
  if (!String(limit.source_code || '').trim()) return false;
  if (!String(limit.source_edition || '').trim()) return false;
  if (!String(limit.source_section || '').trim()) return false;
  return true;
}

export function formatCodeMapping(limit: DocumentedCodeLimit): string {
  const table = limit.source_table ? ` / ${limit.source_table}` : '';
  return `${limit.source_code} ${limit.source_edition} §${limit.source_section}${table}`;
}

/**
 * Resolve threshold for a matrix rule.
 * 1) Platform-encoded row matching occupancy/sprinkler/hazard/fire_class
 * 2) Project-adopted mapping (must be complete)
 * Never invents a fallback number.
 */
export function resolveMatrixThreshold(params: {
  ruleId: string;
  occupancy?: string | null;
  sprinkler_status?: SprinklerStatus | null;
  hazard?: string | null;
  fire_class?: FireClass | null;
  projectMapping?: DocumentedCodeLimit | null;
}): { limit: DocumentedCodeLimit | null; reason: 'platform' | 'project' | 'none' } {
  const def = getRuleMatrixDefinition(params.ruleId);
  if (!def) return { limit: null, reason: 'none' };

  const matchRow = (row: DocumentedCodeLimit): boolean => {
    if (params.occupancy && row.occupancy && row.occupancy !== params.occupancy) return false;
    if (params.sprinkler_status && row.sprinkler_status && row.sprinkler_status !== params.sprinkler_status) {
      return false;
    }
    if (params.hazard && row.hazard && row.hazard !== params.hazard) return false;
    if (params.fire_class && row.fire_class && row.fire_class !== params.fire_class) return false;
    return isCompleteCodeMapping(row);
  };

  const platform = def.encoded_thresholds.find(matchRow) || null;
  if (platform) return { limit: platform, reason: 'platform' };

  if (params.projectMapping && isCompleteCodeMapping(params.projectMapping)) {
    return {
      limit: { ...params.projectMapping, encoding_source: 'project_adopted_mapping' },
      reason: 'project',
    };
  }

  return { limit: null, reason: 'none' };
}
