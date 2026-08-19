import {
  type EngineeringStudyModel,
  type ReportReadinessResult,
  DEFAULT_ENGINEERING_STUDY,
} from './engineering-study-types';
import crypto from 'crypto';

export function parseEngineeringStudy(raw: unknown): EngineeringStudyModel {
  if (!raw || typeof raw !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_ENGINEERING_STUDY));
  }
  const data = raw as Partial<EngineeringStudyModel>;
  return {
    building_information: {
      ...DEFAULT_ENGINEERING_STUDY.building_information,
      ...(data.building_information || {}),
    },
    systems_matrix: {
      ...DEFAULT_ENGINEERING_STUDY.systems_matrix,
      ...(data.systems_matrix || {}),
    },
    fire_pump: {
      ...DEFAULT_ENGINEERING_STUDY.fire_pump,
      ...(data.fire_pump || {}),
    },
    fire_water_tank: {
      ...DEFAULT_ENGINEERING_STUDY.fire_water_tank,
      ...(data.fire_water_tank || {}),
    },
    evidence_list: Array.isArray(data.evidence_list) ? data.evidence_list : [],
  };
}

export function computeReportReadiness(study: EngineeringStudyModel): ReportReadinessResult {
  const reasons: string[] = [];

  // 1. Building Information check
  if (!study.building_information.occupancy || !study.building_information.area_m2) {
    reasons.push('building_info_incomplete');
  }

  // 2. Fire Pump check if required
  if (study.fire_pump.required) {
    if (study.fire_pump.flow_capacity == null || study.fire_pump.flow_capacity <= 0) {
      reasons.push('fire_pump_capacity_missing');
    }
    if (study.fire_pump.pressure == null || study.fire_pump.pressure <= 0) {
      reasons.push('fire_pump_pressure_missing');
    }
    if (study.fire_pump.source_type === 'NOT_CONFIGURED') {
      reasons.push('fire_pump_source_unspecified');
    }
  }

  // 3. Fire Water Tank check if required
  if (study.fire_water_tank.required) {
    if (study.fire_water_tank.capacity == null || study.fire_water_tank.capacity <= 0) {
      reasons.push('tank_capacity_missing');
    }
    if (study.fire_water_tank.source_type === 'NOT_CONFIGURED') {
      reasons.push('tank_source_unspecified');
    }
  }

  // 4. Systems Matrix check
  const matrices = Object.values(study.systems_matrix);
  const unconfiguredRequired = matrices.some(
    (m) => m.status === 'REQUIRED' && m.source_type === 'NOT_CONFIGURED'
  );
  if (unconfiguredRequired) {
    reasons.push('required_system_unconfigured');
  }

  const needsReview = matrices.some((m) => m.status === 'NEEDS_REVIEW');
  if (needsReview) {
    reasons.push('system_requires_engineer_review');
  }

  if (reasons.length > 0) {
    const missingData = reasons.some((r) => r.includes('missing') || r.includes('incomplete') || r.includes('unspecified'));
    return {
      status: missingData ? 'MISSING_REQUIRED_DATA' : 'NEEDS_REVIEW',
      reasons,
    };
  }

  return {
    status: 'READY',
    reasons: [],
  };
}

export interface FinalReportGateParams {
  study: EngineeringStudyModel;
  isEngineerApproved: boolean;
  isDraft?: boolean;
}

export function canGenerateFinalTechnicalReport(params: FinalReportGateParams): {
  allowed: boolean;
  reasons: string[];
} {
  if (params.isDraft) {
    return { allowed: true, reasons: [] };
  }

  const reasons: string[] = [];
  const readiness = computeReportReadiness(params.study);

  if (readiness.status !== 'READY') {
    reasons.push(`readiness_not_ready_${readiness.status}`);
    reasons.push(...readiness.reasons);
  }

  if (!params.isEngineerApproved) {
    reasons.push('engineer_approval_missing');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export interface ReportSnapshotPayload {
  report_version: string;
  engineering_data_snapshot: EngineeringStudyModel;
  systems_matrix: any;
  pump_inputs: any;
  tank_inputs: any;
  rule_ids: string[];
  rule_versions: string[];
  code_editions: string[];
  evidence: any[];
  reviewer: string;
  approved_at: string;
}

export function createImmutableSnapshot(params: {
  reportVersion: string;
  study: EngineeringStudyModel;
  reviewer: string;
  ruleIds?: string[];
  ruleVersions?: string[];
  codeEditions?: string[];
}): { snapshot: ReportSnapshotPayload; hash: string } {
  const snapshot: ReportSnapshotPayload = {
    report_version: params.reportVersion,
    engineering_data_snapshot: JSON.parse(JSON.stringify(params.study)),
    systems_matrix: params.study.systems_matrix,
    pump_inputs: params.study.fire_pump,
    tank_inputs: params.study.fire_water_tank,
    rule_ids: params.ruleIds || [],
    rule_versions: params.ruleVersions || ['2025'],
    code_editions: params.codeEditions || ['NFPA 13-2025', 'SBC 201'],
    evidence: params.study.evidence_list,
    reviewer: params.reviewer,
    approved_at: new Date().toISOString(),
  };

  const jsonStr = JSON.stringify(snapshot);
  const hash = crypto.createHash('sha256').update(jsonStr).digest('hex');

  return { snapshot, hash };
}
