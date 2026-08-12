/**
 * Freeze authoritative compliance runs into ProjectEngineeringData.compliance.
 * Approved reports must replay the frozen snapshot — not invent a new run.
 */

import type {
  ComplianceGateDecision,
  ComplianceMatrixRow,
  ComplianceResultStatus,
  ComplianceRunResult,
  ProjectComplianceState,
} from '@/lib/projects/compliance/types';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export type FrozenComplianceSnapshot = NonNullable<ProjectComplianceState['approved_snapshot']>;

export function freezeComplianceSnapshot(params: {
  run: ComplianceRunResult;
  stageId: string;
  datasetRevision?: string | null;
  sourceCode?: string | null;
  codeEdition?: string | null;
}): FrozenComplianceSnapshot {
  return {
    frozen_at: new Date().toISOString(),
    frozen_for_stage: params.stageId,
    dataset_revision: params.datasetRevision ?? null,
    gate: params.run.gate,
    evaluatedAt: params.run.evaluatedAt,
    matrix: params.run.matrix,
    counts: params.run.counts,
    mandatoryFail: params.run.mandatoryFail,
    mandatoryNeedsData: params.run.mandatoryNeedsData,
    allMandatoryPass: params.run.allMandatoryPass,
    gateReasons: params.run.gateReasons,
    source_code: params.sourceCode ?? 'SBC 201/801',
    code_edition: params.codeEdition ?? null,
    results: params.run.results.map((r) => ({
      ruleId: r.ruleId,
      status: r.status,
      effectiveStatus: r.effectiveStatus,
      message: r.message,
      code_reference: r.code_reference || r.section || null,
    })),
  };
}

export function attachFrozenComplianceSnapshot(
  data: ProjectEngineeringData,
  snapshot: FrozenComplianceSnapshot
): ProjectEngineeringData {
  const prev = data.compliance || {};
  return {
    ...data,
    compliance: {
      ...prev,
      last_run_at: snapshot.evaluatedAt,
      last_gate: snapshot.gate,
      approved_snapshot: snapshot,
    },
  };
}

/**
 * Rebuild a ComplianceRunResult-shaped object from a frozen snapshot.
 * Used by approved report rendering — does not re-evaluate rules.
 */
export function complianceRunFromFrozenSnapshot(
  snapshot: FrozenComplianceSnapshot
): ComplianceRunResult {
  return {
    evaluatedAt: snapshot.evaluatedAt,
    results: (snapshot.results || []).map((r) => ({
      ruleId: r.ruleId,
      code: '',
      section: r.code_reference || '',
      title: r.ruleId,
      title_ar: r.ruleId,
      severity: 'mandatory',
      applicability: 'frozen',
      requiredInputs: [],
      status: r.status,
      effectiveStatus: r.effectiveStatus,
      message: r.message,
      reason: r.message,
      inputs: {},
      evidence: [],
      override: null,
      evidenceRequired: [],
      code_reference: r.code_reference,
    })),
    counts: snapshot.counts,
    mandatoryFail: snapshot.mandatoryFail,
    mandatoryNeedsData: snapshot.mandatoryNeedsData,
    allMandatoryPass: snapshot.allMandatoryPass,
    gate: snapshot.gate,
    gateReasons: snapshot.gateReasons,
    matrix: snapshot.matrix as ComplianceMatrixRow[],
  };
}

/**
 * For approved technical reports (or any frozen stage), prefer the immutable snapshot.
 * Draft / unapproved → caller should run live authoritative engine.
 */
export function resolveComplianceRunForReport(params: {
  data: ProjectEngineeringData;
  liveRun: ComplianceRunResult;
  preferFrozenWhenApproved?: boolean;
}): { run: ComplianceRunResult; fromFreeze: boolean } {
  const prefer = params.preferFrozenWhenApproved !== false;
  const snap = params.data.compliance?.approved_snapshot;
  const techApproved = params.data.technical_report?.status === 'معتمد';
  if (prefer && snap && (techApproved || snap.gate === 'ALLOW' || snap.gate === 'BLOCKED')) {
    return { run: complianceRunFromFrozenSnapshot(snap), fromFreeze: true };
  }
  return { run: params.liveRun, fromFreeze: false };
}

export function snapshotGate(snapshot: FrozenComplianceSnapshot | null | undefined): ComplianceGateDecision | null {
  return snapshot?.gate ?? null;
}

export function snapshotStatusCounts(
  snapshot: FrozenComplianceSnapshot | null | undefined
): Record<ComplianceResultStatus, number> | null {
  return snapshot?.counts ?? null;
}
