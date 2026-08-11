/**
 * Saudi Code Compliance Engine (SBC 201 / SBC 801) — core types.
 * Deterministic rules only; AI findings are never authoritative.
 */

export type ComplianceResultStatus = 'PASS' | 'FAIL' | 'NEEDS_DATA' | 'N/A';

export type ComplianceSeverity = 'mandatory' | 'advisory';

export type ComplianceCodeFamily = 'SBC 201' | 'SBC 801' | 'SBC' | 'PLATFORM';

export type ComplianceEvidenceKind =
  | 'measurement'
  | 'drawing'
  | 'calculation'
  | 'photo'
  | 'document'
  | 'engineer_statement'
  | 'none';

export type ComplianceEvidence = {
  kind: ComplianceEvidenceKind;
  label: string;
  value?: string | number | boolean | null;
  source?: string;
  ref?: string;
};

export type EngineerOverride = {
  ruleId: string;
  reason: string;
  /** Required SBC / code section reference */
  codeReference: string;
  /** Engineer identity (name) — required for accepted override */
  engineerName?: string;
  /** Auth user id when available — preferred with name */
  engineerUserId?: string;
  /**
   * Role/authority claim for the override (e.g. licensed_engineer).
   * Required for acceptance — free-text name alone is not enough to imply authority.
   */
  engineerRole?: string;
  overriddenAt: string;
  /** Status claimed after override — never auto-PASS without reason+ref+identity+role+timestamp */
  resultingStatus: 'PASS' | 'N/A';
};

export type ComplianceApplicability = {
  description: string;
  when?: string;
};

export type ComplianceRuleEvaluation = {
  status: ComplianceResultStatus;
  /** Human-readable reason (always set) */
  message: string;
  reason?: string;
  inputs?: Record<string, string | number | boolean | null | undefined>;
  evidence?: ComplianceEvidence[];
  remediation?: string;
  /** Trace fields for matrix / audit */
  actual_value?: string | number | boolean | null;
  required_value?: string | number | boolean | null;
  unit?: string | null;
  occupancy?: string | null;
  condition?: string | null;
  code_reference?: string | null;
  required_value_source?:
    | 'platform_code_table'
    | 'explicit_code_condition'
    | 'project_design'
    | 'documentation_completeness'
    | 'engineer_attested'
    | 'missing'
    | null;
  missing_data?: string[];
};

export type ComplianceRuleContext = {
  evaluatedAt: string;
  client: {
    id?: string;
    name?: string;
    activity_type?: string | null;
    floors_count?: number | null;
    building_area?: number | null;
    land_area?: number | null;
  };
  building: {
    occupancy_classification?: string | null;
    /** Building use / type classification (not construction type) */
    building_type_code?: string | null;
    group_letter?: string | null;
    /** SBC construction type (Type I-A …) — never guessed from unrelated fields */
    construction_type?: string | null;
    /** Gross building floor area (m²) — NOT site area */
    building_area_m2?: number | null;
    /** Site / plot area (m²) — kept separate; not used as building area substitute */
    total_site_area_m2?: number | null;
    building_height_m?: number | null;
    stories?: number | null;
    basement_floors?: number | null;
    high_rise?: boolean | null;
    mixed_occupancy?: boolean | null;
    underground?: boolean | null;
    windowless?: boolean | null;
    atrium?: boolean | null;
    special_conditions: string[];
    /** Primary SBC occupancy code when known from zones */
    primary_occupancy_code?: string | null;
  };
  occupancyZones: Array<{
    floor_name: string;
    zone_label: string;
    occupancy_code?: string | null;
    group_letter?: string | null;
    area_m2?: number | null;
    occupant_load?: number | null;
    load_factor_m2?: number | null;
  }>;
  egress: {
    occupant_load_total?: number | null;
    exits_count?: number | null;
    stairs_count?: number | null;
    emergency_exit_doors?: string | null;
    travel_distance_m?: number | null;
    common_path_m?: number | null;
    dead_end_m?: number | null;
    exit_capacity_persons?: number | null;
    exit_separation_m?: number | null;
    /** Engineer-documented required separation (m) when code table not automated */
    required_exit_separation_m?: number | null;
    corridor_width_m?: number | null;
    required_corridor_width_m?: number | null;
    door_width_m?: number | null;
    required_door_width_m?: number | null;
    stair_width_m?: number | null;
    required_stair_width_m?: number | null;
    exit_discharge_ok?: boolean | null;
    exit_access_ok?: boolean | null;
    notes?: string | null;
    metrics: Array<{ label: string; value: string }>;
  };
  fireAccess: {
    site_entrance?: string | null;
    fire_road?: string | null;
    road_width_m?: number | null;
    /** Documented min width from project/code entry — not invented */
    required_road_width_m?: number | null;
    required_road_width_code_ref?: string | null;
    building_access?: string | null;
    staging_area?: string | null;
    fdc_present?: string | null;
    fdc_location?: string | null;
    notes?: string | null;
  };
  fireProtection: {
    hazard_class?: string | null;
    /** Determined requirement */
    sprinkler_required?: 'yes' | 'no' | 'unknown' | null;
    /** Stated as present on plan/design */
    sprinkler_provided?: 'yes' | 'no' | 'unknown' | null;
    /** Verified via calculation/evidence (not merely “yes”) */
    sprinkler_verified?: boolean | null;
    sprinkler_system_type?: string | null;
    design_area_m2?: number | null;
    density_lpm_m2?: number | null;
    sprinkler_demand_lpm?: number | null;
    hose_allowance_lpm?: number | null;
    standpipe_required?: 'yes' | 'no' | 'unknown' | null;
    standpipe_provided?: 'yes' | 'no' | 'unknown' | null;
    pump_exists?: 'yes' | 'no' | 'unknown' | null;
    pump_flow_lpm?: number | null;
    pump_pressure_bar?: number | null;
    tank_exists?: 'yes' | 'no' | 'unknown' | null;
    tank_volume_m3?: number | null;
    tank_duration_min?: number | null;
    tank_required_m3?: number | null;
    fdc_required?: boolean | null;
    extinguisher_count?: number | null;
    applicable_codes: string[];
  };
  hydraulic: {
    /** True only when core network numeric fields are present — never from attachment alone */
    has_network_data: boolean;
    attachment_count: number;
    k_factor?: number | null;
    flow_lpm?: number | null;
    pressure_bar?: number | null;
    required_residual_pressure_bar?: number | null;
    pipe_diameter_mm?: number | null;
    pipe_length_m?: number | null;
    elevation_m?: number | null;
    friction_loss_bar?: number | null;
    remote_area_m2?: number | null;
    node_demand_lpm?: number | null;
    pump_flow_lpm?: number | null;
    pump_pressure_bar?: number | null;
    tank_volume_m3?: number | null;
  };
  fireAlarm: {
    panel?: string | null;
    detection?: string | null;
    manual_call_points?: string | null;
    notification?: string | null;
    emergency_power?: string | null;
    coverage?: string | null;
    interfaces?: string | null;
    cause_and_effect?: string | null;
    /** Determined requirement */
    required?: boolean | null;
    provided?: 'yes' | 'no' | 'unknown' | null;
    verified?: boolean | null;
    building_plan_alarm?: 'yes' | 'no' | 'unknown' | '' | null;
  };
  smokeControl: {
    required?: boolean | null;
    status?: 'required' | 'not_required' | 'by_design' | 'unknown' | null;
    note?: string | null;
    ventilation_only?: boolean | null;
  };
  overrides: EngineerOverride[];
};

export type ComplianceRule = {
  id: string;
  code: ComplianceCodeFamily | string;
  section: string;
  title: string;
  title_ar?: string;
  applicability: ComplianceApplicability;
  requiredInputs: string[];
  severity: ComplianceSeverity;
  evidenceRequired: ComplianceEvidenceKind[];
  evaluate: (ctx: ComplianceRuleContext) => ComplianceRuleEvaluation;
};

export type ComplianceRuleResult = {
  ruleId: string;
  code: string;
  section: string;
  title: string;
  title_ar?: string;
  severity: ComplianceSeverity;
  applicability: string;
  requiredInputs: string[];
  /** Original engine status before override */
  status: ComplianceResultStatus;
  /** Effective status after engineer override (if any) */
  effectiveStatus: ComplianceResultStatus;
  message: string;
  reason: string;
  inputs: Record<string, string | number | boolean | null | undefined>;
  evidence: ComplianceEvidence[];
  remediation?: string;
  override?: EngineerOverride | null;
  evidenceRequired: ComplianceEvidenceKind[];
  actual_value?: string | number | boolean | null;
  required_value?: string | number | boolean | null;
  unit?: string | null;
  occupancy?: string | null;
  condition?: string | null;
  code_reference?: string | null;
  required_value_source?:
    | 'platform_code_table'
    | 'explicit_code_condition'
    | 'project_design'
    | 'documentation_completeness'
    | 'engineer_attested'
    | 'missing'
    | null;
  missing_data?: string[];
};

export type ComplianceGateDecision = 'ALLOW' | 'BLOCKED';

export type ComplianceRunResult = {
  evaluatedAt: string;
  results: ComplianceRuleResult[];
  counts: Record<ComplianceResultStatus, number>;
  mandatoryFail: number;
  mandatoryNeedsData: number;
  allMandatoryPass: boolean;
  gate: ComplianceGateDecision;
  gateReasons: string[];
  matrix: ComplianceMatrixRow[];
};

export type ComplianceMatrixRow = {
  requirement: string;
  code: string;
  section: string;
  input: string;
  actual: string;
  required: string;
  result: ComplianceResultStatus;
  evidence: string;
  engineerOverride: string;
  status: ComplianceResultStatus;
  code_reference: string;
  required_value_source?: string;
};

/** Persisted project snapshot (additive on ProjectEngineeringData) */
export type ProjectComplianceState = {
  overrides?: EngineerOverride[];
  last_run_at?: string | null;
  last_gate?: ComplianceGateDecision | null;
  notes?: string;
};
