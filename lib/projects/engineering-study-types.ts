export type SystemRequirementStatus =
  | 'REQUIRED'
  | 'NOT_REQUIRED'
  | 'NEEDS_REVIEW'
  | 'NOT_CONFIGURED';

export type EngineeringSourceType =
  | 'VERIFIED_RULE'
  | 'ENGINEER_INPUT'
  | 'PROJECT_DOCUMENT'
  | 'CALCULATION'
  | 'NOT_CONFIGURED';

export type SystemKey =
  | 'automatic_sprinkler'
  | 'fire_hose_standpipe'
  | 'fire_pump'
  | 'fire_water_tank'
  | 'fire_extinguishers'
  | 'fire_alarm'
  | 'emergency_exit'
  | 'other';

export interface SystemMatrixEntry {
  status: SystemRequirementStatus;
  source_type: EngineeringSourceType;
  source_reference?: string;
  engineer_notes?: string;
  review_status?: string;
}

export type SystemsMatrixModel = Record<SystemKey, SystemMatrixEntry>;

export interface BuildingInformationModel {
  occupancy: string;
  use: string;
  construction_status: string;
  area_m2: string;
  floors: string;
  height_m: string;
  notes?: string;
}

export interface FirePumpInputsModel {
  required: boolean;
  flow_capacity: number | null;
  flow_unit: 'GPM' | 'L/min';
  pressure: number | null;
  pressure_unit: 'bar' | 'psi';
  pump_type: string;
  configuration: string;
  source_type: EngineeringSourceType;
  code_reference?: string;
  engineer_notes?: string;
}

export interface FireWaterTankInputsModel {
  required: boolean;
  capacity: number | null;
  capacity_unit: 'm3' | 'gallons' | 'liters';
  design_duration: number | null;
  duration_unit: 'hours' | 'minutes';
  source_type: EngineeringSourceType;
  code_reference?: string;
  engineer_notes?: string;
}

export interface EvidenceModelItem {
  source_type: EngineeringSourceType;
  rule_id: string;
  code: string;
  edition: string;
  document_id?: string;
  page?: number | null;
  section?: string;
  table_reference?: string;
  figure_reference?: string;
  evidence_snippet?: string;
  calculation_reference?: string;
  engineer_note?: string;
}

export interface EngineeringStudyModel {
  building_information: BuildingInformationModel;
  systems_matrix: SystemsMatrixModel;
  fire_pump: FirePumpInputsModel;
  fire_water_tank: FireWaterTankInputsModel;
  evidence_list: EvidenceModelItem[];
  engineer_approval?: {
    approved: boolean;
    reviewer_name?: string;
    review_notes?: string;
    approval_timestamp?: string;
  };
}

export type ReportReadinessStatus = 'READY' | 'NEEDS_REVIEW' | 'MISSING_REQUIRED_DATA';

export interface ReportReadinessResult {
  status: ReportReadinessStatus;
  reasons: string[];
}

export interface ApprovedRuleCheck {
  verification_status: string;
  rule_status: string;
  is_active: boolean;
}

export function isRuleApprovedAndActive(rule: ApprovedRuleCheck): boolean {
  return (
    rule.verification_status === 'APPROVED' &&
    rule.rule_status === 'active' &&
    rule.is_active === true
  );
}

export const DEFAULT_SYSTEMS_MATRIX: SystemsMatrixModel = {
  automatic_sprinkler: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
  fire_hose_standpipe: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
  fire_pump: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
  fire_water_tank: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
  fire_extinguishers: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
  fire_alarm: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
  emergency_exit: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
  other: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
};

export const DEFAULT_BUILDING_INFO: BuildingInformationModel = {
  occupancy: '',
  use: '',
  construction_status: 'تحت الإنشاء',
  area_m2: '',
  floors: '',
  height_m: '',
};

export const DEFAULT_FIRE_PUMP: FirePumpInputsModel = {
  required: false,
  flow_capacity: null,
  flow_unit: 'GPM',
  pressure: null,
  pressure_unit: 'bar',
  pump_type: '',
  configuration: '',
  source_type: 'NOT_CONFIGURED',
};

export const DEFAULT_FIRE_TANK: FireWaterTankInputsModel = {
  required: false,
  capacity: null,
  capacity_unit: 'm3',
  design_duration: null,
  duration_unit: 'hours',
  source_type: 'NOT_CONFIGURED',
};

export const DEFAULT_ENGINEERING_STUDY: EngineeringStudyModel = {
  building_information: DEFAULT_BUILDING_INFO,
  systems_matrix: DEFAULT_SYSTEMS_MATRIX,
  fire_pump: DEFAULT_FIRE_PUMP,
  fire_water_tank: DEFAULT_FIRE_TANK,
  evidence_list: [],
};
