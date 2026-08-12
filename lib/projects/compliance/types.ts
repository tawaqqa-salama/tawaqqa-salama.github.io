/**
 * Saudi Code Compliance Engine (SBC 201 / SBC 801) — core types.
 *
 * AUTHORITATIVE COMPLIANCE (Phase 2.3):
 *   Only this module family (`lib/projects/compliance`) may produce
 *   PASS / FAIL / NEEDS_DATA / BLOCKED for workflow gates and approved reports.
 *
 * Advisory stacks (`lib/compliance`, Design Intelligence, Design Center vision,
 * knowledge-engine estimates) may show findings/recommendations only — they
 * must never unlock stages or override this engine.
 *
 * Canonical engineering inputs resolve from ProjectEngineeringData backed by
 * project_engineering_live.payload (see lib/projects/canonical-engineering.ts).
 */

export type ComplianceResultStatus =
  | 'PASS'
  | 'FAIL'
  | 'NEEDS_DATA'
  | 'N/A'
  | 'BLOCKED'
  /** Canonical source conflict — cannot invent a PASS from either side */
  | 'CONFLICT'
  /** Edition/table not encoded in-platform — never invent a threshold */
  | 'RULE_NOT_CONFIGURED';

/** Project-documented adopted code mapping (edition + section required for PASS/FAIL). */
export type ProjectCodeMapping = {
  value: number;
  unit: string;
  source_code: string;
  source_edition: string;
  source_section: string;
  source_table?: string | null;
  applicability?: string | null;
  occupancy?: string | null;
  sprinkler_status?: 'sprinklered' | 'non_sprinklered' | null;
  hazard?: string | null;
  fire_class?: 'A' | 'B' | 'C' | 'D' | 'K' | null;
};

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
    | 'documented_code_mapping'
    | 'missing'
    | null;
  missing_data?: string[];
  /** Structured evidence package fields for matrix PASS/FAIL/BLOCKED */
  source_code?: string | null;
  source_edition?: string | null;
  source_section?: string | null;
  source_table?: string | null;
  measured_value?: string | number | boolean | null;
  decision?: string | null;
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
    /** Explicit sprinkler status for MoE tables — never inferred from “FP system exists” */
    sprinkler_status?: 'sprinklered' | 'non_sprinklered' | null;
    path_geometry_documented?: boolean | null;
    occupant_load_served?: number | null;
    corridor_type?: string | null;
    corridor_clear_width_m?: number | null;
    door_type?: string | null;
    door_clear_opening_width_m?: number | null;
    door_egress_direction?: string | null;
    stair_clear_width_m?: number | null;
    travel_distance_mapping?: ProjectCodeMapping | null;
    common_path_mapping?: ProjectCodeMapping | null;
    dead_end_mapping?: ProjectCodeMapping | null;
    corridor_width_mapping?: ProjectCodeMapping | null;
    door_width_mapping?: ProjectCodeMapping | null;
    stair_width_mapping?: ProjectCodeMapping | null;
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
    element_type?: string | null;
    required_clearance_m?: number | null;
    measured_clearance_m?: number | null;
    accessible_route_status?: string | null;
    turning_space_dimensions?: string | null;
    obstruction_geometry?: string | null;
    clearance_mapping?: ProjectCodeMapping | null;
    turning_mapping?: ProjectCodeMapping | null;
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
    /** Matrix inputs — never invent defaults */
    commodity?: string | null;
    sprinkler_count?: number | null;
    ceiling_installation_conditions?: string | null;
    sprinkler_design_method?: string | null;
    nfpa_edition?: string | null;
    hose_table_id?: string | null;
    density_mapping?: ProjectCodeMapping | null;
    hose_mapping?: ProjectCodeMapping | null;
    standpipe_demand_lpm?: number | null;
    other_required_fire_demand_lpm?: number | null;
    usable_tank_volume_m3?: number | null;
    tank_reserve_or_dedicated_fire_volume_m3?: number | null;
    tank_mapping?: ProjectCodeMapping | null;
    fire_class?: 'A' | 'B' | 'C' | 'D' | 'K' | null;
    extinguisher_hazard_level?: string | null;
    extinguisher_rating?: string | null;
    extinguisher_floor_area_m2?: number | null;
    extinguisher_travel_distance_m?: number | null;
    special_hazards?: string | null;
    cooking_hazard?: boolean | null;
    extinguisher_mapping?: ProjectCodeMapping | null;
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
  /**
   * SBC 201-2024 Chapter 10 Means of Egress structured inputs.
   * Never invent defaults — missing fields drive NEEDS_DATA.
   */
  sbc201Egress?: Sbc201EgressInputs | null;
  /**
   * NFPA architecture context (canonical inputs only).
   * Built alongside SBC context — never from vision/DI/estimates.
   */
  nfpa?: import('@/lib/projects/compliance/nfpa/types').NfpaEngineeringContext | null;
};

/** Structured MoE inputs for SBC201-EGR-001..028 */
export type Sbc201EgressInputs = {
  occupancyGroup?: string | null;
  occupancy?: string | null;
  spaceUse?: string | null;
  grossArea?: number | null;
  netArea?: number | null;
  applicableAreaBasis?: 'gross' | 'net' | null;
  occupantLoadFactor?: number | null;
  occupantLoadFactorMapping?: ProjectCodeMapping | null;
  calculatedOccupantLoad?: number | null;
  designOccupantLoad?: number | null;
  storyOccupantLoad?: number | null;
  buildingOccupantLoad?: number | null;
  storyLevel?: string | null;
  story?: string | null;
  sprinklerStatus?: 'sprinklered' | 'non_sprinklered' | null;
  exitsProvided?: number | null;
  exitAccessDoorways?: number | null;
  specialOccupancyCondition?: string | null;
  numberOfExitsMapping?: ProjectCodeMapping | null;
  travelDistance?: number | null;
  commonPath?: number | null;
  applicableTableException?: string | null;
  singleExitMapping?: ProjectCodeMapping | null;
  occupantLoadServed?: number | null;
  exitComponentType?: string | null;
  clearWidth?: number | null;
  applicableCapacityFactor?: number | null;
  sprinklerCondition?: string | null;
  applicableTableSection?: string | null;
  capacityMapping?: ProjectCodeMapping | null;
  requiredExitCount?: number | null;
  areaDimensions?: string | null;
  diagonalDimension?: number | null;
  exitToExitDistance?: number | null;
  applicableException?: string | null;
  separationMapping?: ProjectCodeMapping | null;
  commonPathDistance?: number | null;
  commonPathMapping?: ProjectCodeMapping | null;
  specialCondition?: string | null;
  travelDistanceMapping?: ProjectCodeMapping | null;
  corridorType?: string | null;
  corridorClearWidth?: number | null;
  corridorMapping?: ProjectCodeMapping | null;
  deadEndLength?: number | null;
  corridorConfiguration?: string | null;
  deadEndMapping?: ProjectCodeMapping | null;
  doorType?: string | null;
  clearOpeningWidth?: number | null;
  leafWidth?: number | null;
  egressDirection?: string | null;
  doorLocation?: string | null;
  doorClearMapping?: ProjectCodeMapping | null;
  doorSwingDirection?: string | null;
  egressCondition?: string | null;
  applicableSection?: string | null;
  doorSwingMapping?: ProjectCodeMapping | null;
  lockingType?: string | null;
  panicHardware?: boolean | null;
  fireExitHardware?: boolean | null;
  panicHardwareMapping?: ProjectCodeMapping | null;
  stairCount?: number | null;
  stairClearWidth?: number | null;
  stairWidthMapping?: ProjectCodeMapping | null;
  riserHeight?: number | null;
  stairType?: string | null;
  applicableSectionTable?: string | null;
  riserMapping?: ProjectCodeMapping | null;
  treadDepth?: number | null;
  treadMapping?: ProjectCodeMapping | null;
  headroom?: number | null;
  headroomMapping?: ProjectCodeMapping | null;
  landingWidth?: number | null;
  landingDepth?: number | null;
  stairWidth?: number | null;
  doorSwing?: string | null;
  landingMapping?: ProjectCodeMapping | null;
  rampWidth?: number | null;
  slope?: number | null;
  rise?: number | null;
  run?: number | null;
  landing?: string | null;
  handrail?: string | null;
  egressUse?: string | null;
  rampMapping?: ProjectCodeMapping | null;
  exitSignRequired?: boolean | null;
  signProvided?: boolean | null;
  visibility?: string | null;
  directionalSign?: boolean | null;
  emergencyPower?: boolean | null;
  applicableCondition?: string | null;
  exitSignMapping?: ProjectCodeMapping | null;
  handrailRequired?: boolean | null;
  height?: number | null;
  continuity?: boolean | null;
  extensions?: boolean | null;
  clearance?: number | null;
  sides?: string | null;
  stairOrRampType?: string | null;
  handrailMapping?: ProjectCodeMapping | null;
  guardRequired?: boolean | null;
  openingSize?: number | null;
  location?: string | null;
  occupancyUse?: string | null;
  guardMapping?: ProjectCodeMapping | null;
  pathGeometry?: string | null;
  interveningRooms?: string | null;
  accessPath?: string | null;
  exitAccessCondition?: string | null;
  applicableExceptions?: string | null;
  exitAccessMapping?: ProjectCodeMapping | null;
  componentType?: string | null;
  storiesConnected?: number | null;
  enclosureCondition?: string | null;
  exitAccessStairMapping?: ProjectCodeMapping | null;
  enclosure?: string | null;
  fireResistance?: number | null;
  openingProtection?: string | null;
  penetrations?: string | null;
  continuityStr?: string | null;
  discharge?: string | null;
  smokeProtectionIfRequired?: string | null;
  interiorExitStairMapping?: ProjectCodeMapping | null;
  width?: number | null;
  occupantLoad?: number | null;
  exitPassagewayMapping?: ProjectCodeMapping | null;
  horizontalExit?: boolean | null;
  refugeArea?: number | null;
  fireBarrier?: string | null;
  capacity?: number | null;
  horizontalExitMapping?: ProjectCodeMapping | null;
  exitDischarge?: string | null;
  dischargePath?: string | null;
  publicWay?: string | null;
  obstruction?: string | null;
  levelChange?: string | null;
  doorCondition?: string | null;
  exitDischargeMapping?: ProjectCodeMapping | null;
  courtWidth?: number | null;
  courtLength?: number | null;
  exitAccess?: string | null;
  dischargeRelationship?: string | null;
  egressCourtMapping?: ProjectCodeMapping | null;
  /** Attachment counts never imply PASS */
  attachmentCount?: number | null;
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
    | 'documented_code_mapping'
    | 'missing'
    | null;
  missing_data?: string[];
  source_code?: string | null;
  source_edition?: string | null;
  source_section?: string | null;
  source_table?: string | null;
  measured_value?: string | number | boolean | null;
  decision?: string | null;
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

/** Immutable compliance freeze captured on compliance-gated stage approval. */
export type ApprovedComplianceSnapshot = {
  frozen_at: string;
  frozen_for_stage: string;
  dataset_revision?: string | null;
  gate: ComplianceGateDecision;
  evaluatedAt: string;
  matrix: ComplianceMatrixRow[];
  counts: Record<ComplianceResultStatus, number>;
  mandatoryFail: number;
  mandatoryNeedsData: number;
  allMandatoryPass: boolean;
  gateReasons: string[];
  /** Documented code family for the freeze (edition may still be null). */
  source_code?: string | null;
  /** Explicit edition when documented — never invented at freeze time. */
  code_edition?: string | null;
  results: Array<{
    ruleId: string;
    status: ComplianceResultStatus;
    effectiveStatus: ComplianceResultStatus;
    message: string;
    code_reference?: string | null;
  }>;
};

/** Persisted project snapshot (additive on ProjectEngineeringData) */
export type ProjectComplianceState = {
  overrides?: EngineerOverride[];
  last_run_at?: string | null;
  last_gate?: ComplianceGateDecision | null;
  notes?: string;
  /**
   * Immutable/versioned snapshot of the authoritative compliance run at approval.
   * Approved reports MUST display this result even if later rules/data change.
   */
  approved_snapshot?: ApprovedComplianceSnapshot | null;
  /**
   * NFPA 13 numeric encoding — project-adopted rows + design inputs + edition metadata.
   * Not a new DB table; lives in existing engineering JSON payload.
   * Platform thresholds remain empty until a verified edition is encoded.
   * Never stores copyrighted NFPA document bodies — metadata/traceability only.
   */
  nfpa13_numeric?: {
    /**
     * Project-adopted edition identity (cover). Does NOT make platform
     * VERIFIED_OFFICIAL. Tables stay RULE_NOT_CONFIGURED until section cells verified.
     */
    edition_adoption?: import('@/lib/projects/compliance/nfpa/nfpa13-edition').Nfpa13EditionAdoption | null;
    adopted_rows?: import('@/lib/projects/compliance/nfpa/nfpa13-tables').Nfpa13EncodedRow[];
    inputs?: {
      design_area_m2?: number | null;
      density_lpm_m2?: number | null;
      sprinkler_spacing_m?: number | null;
      max_coverage_m2?: number | null;
      hose_allowance_lpm?: number | null;
      remote_area_m2?: number | null;
    };
  } | null;
};
