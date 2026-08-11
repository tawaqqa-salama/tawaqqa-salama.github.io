/**
 * Aggregate compliance results + approval gate.
 * Mandatory FAIL or NEEDS_DATA → BLOCKED. All mandatory PASS → ALLOW.
 * Overrides require reason + code reference; never silent PASS.
 */

import { formatEvidenceList } from '@/lib/projects/compliance/evidence';
import type {
  ComplianceGateDecision,
  ComplianceMatrixRow,
  ComplianceResultStatus,
  ComplianceRuleResult,
  ComplianceRunResult,
  EngineerOverride,
} from '@/lib/projects/compliance/types';

export function emptyCounts(): Record<ComplianceResultStatus, number> {
  return { PASS: 0, FAIL: 0, NEEDS_DATA: 0, 'N/A': 0 };
}

export function applyOverride(
  base: ComplianceRuleResult,
  override: EngineerOverride | undefined
): ComplianceRuleResult {
  if (!override) return { ...base, override: null };
  const reasonOk = String(override.reason || '').trim().length >= 8;
  const refOk = String(override.codeReference || '').trim().length >= 3;
  if (!reasonOk || !refOk) {
    return {
      ...base,
      override,
      effectiveStatus: base.status,
      message: `${base.message} — تجاوز مهندس مرفوض (يلزم سبب ≥8 أحرف + مرجع كودي).`,
    };
  }
  return {
    ...base,
    override,
    effectiveStatus: override.resultingStatus,
    message: `${base.message} — تجاوز مهندس: ${override.reason} [${override.codeReference}]`,
  };
}

export function summarizeResults(results: ComplianceRuleResult[]): ComplianceRunResult {
  const counts = emptyCounts();
  for (const r of results) counts[r.effectiveStatus] += 1;

  const mandatory = results.filter((r) => r.severity === 'mandatory' && r.effectiveStatus !== 'N/A');
  const mandatoryFail = mandatory.filter((r) => r.effectiveStatus === 'FAIL').length;
  const mandatoryNeedsData = mandatory.filter((r) => r.effectiveStatus === 'NEEDS_DATA').length;
  const allMandatoryPass =
    mandatory.length > 0 &&
    mandatory.every((r) => r.effectiveStatus === 'PASS') &&
    mandatoryFail === 0 &&
    mandatoryNeedsData === 0;

  const gateReasons: string[] = [];
  if (mandatoryFail > 0) {
    gateReasons.push(`${mandatoryFail} متطلب إلزامي FAIL`);
  }
  if (mandatoryNeedsData > 0) {
    gateReasons.push(`${mandatoryNeedsData} متطلب إلزامي NEEDS_DATA`);
  }
  if (mandatory.length === 0) {
    // No applicable mandatory rules → still need data to claim compliance
    gateReasons.push('لا توجد متطلبات إلزامية قابلة للتقييم — NEEDS_DATA ضمني');
  }

  let gate: ComplianceGateDecision = 'BLOCKED';
  if (allMandatoryPass) {
    gate = 'ALLOW';
  }

  const matrix: ComplianceMatrixRow[] = results.map((r) => ({
    requirement: r.title_ar || r.title,
    code: r.code,
    section: r.section,
    input: formatInputs(r.inputs),
    result: r.status,
    evidence: formatEvidenceList(r.evidence),
    engineerOverride: r.override
      ? `${r.override.reason} (${r.override.codeReference}) → ${r.override.resultingStatus}`
      : '—',
    status: r.effectiveStatus,
  }));

  return {
    evaluatedAt: new Date().toISOString(),
    results,
    counts,
    mandatoryFail,
    mandatoryNeedsData,
    allMandatoryPass,
    gate,
    gateReasons: gate === 'ALLOW' ? [] : gateReasons,
    matrix,
  };
}

export function formatInputs(
  inputs: Record<string, string | number | boolean | null | undefined>
): string {
  const entries = Object.entries(inputs || {}).filter(([, v]) => v !== undefined);
  if (!entries.length) return '—';
  return entries.map(([k, v]) => `${k}=${v == null || v === '' ? '∅' : String(v)}`).join('، ');
}

export function gateBlockerMessages(run: ComplianceRunResult): string[] {
  if (run.gate === 'ALLOW') return [];
  const lines = [
    'بوابة المطابقة الكودية (SBC): الحالة BLOCKED',
    ...run.gateReasons,
  ];
  const samples = run.results
    .filter(
      (r) =>
        r.severity === 'mandatory' &&
        (r.effectiveStatus === 'FAIL' || r.effectiveStatus === 'NEEDS_DATA')
    )
    .slice(0, 6)
    .map((r) => `• ${r.title_ar || r.title}: ${r.effectiveStatus}`);
  return [...lines, ...samples];
}

/** Stages that require compliance ALLOW before approval */
export const COMPLIANCE_GATED_STAGES = [
  'technical_report',
  'transmittals',
  'final_report',
  'completion',
] as const;

export type ComplianceGatedStage = (typeof COMPLIANCE_GATED_STAGES)[number];

export function isComplianceGatedStage(stageId: string): stageId is ComplianceGatedStage {
  return (COMPLIANCE_GATED_STAGES as readonly string[]).includes(stageId);
}
