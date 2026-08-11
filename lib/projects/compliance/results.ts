/**
 * Aggregate compliance results + approval gate.
 * Mandatory FAIL or NEEDS_DATA → BLOCKED. All mandatory PASS → ALLOW.
 * Overrides require reason + code reference + engineer identity; never hide original status.
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
  const identityOk =
    String(override.engineerName || '').trim().length >= 2 ||
    String(override.engineerUserId || '').trim().length >= 2;
  const roleOk = String(override.engineerRole || '').trim().length >= 3;
  const tsOk = String(override.overriddenAt || '').trim().length >= 10;

  if (!reasonOk || !refOk || !identityOk || !roleOk || !tsOk) {
    return {
      ...base,
      override,
      // Keep original status — override rejected / BLOCK for this rule
      effectiveStatus: base.status,
      message: `${base.message} — تجاوز مهندس مرفوض (يلزم سبب ≥8 + مرجع كودي + هوية + صلاحية/دور ≥3 + وقت). النتيجة الأصلية: ${base.status}`,
      reason: `${base.reason} | override_rejected`,
    };
  }

  // Documented engineer exception only — never hides original automated result
  const identity = override.engineerName || override.engineerUserId || 'engineer';
  const role = String(override.engineerRole).trim();
  return {
    ...base,
    override,
    // Original status preserved in `status`; effectiveStatus reflects override
    effectiveStatus: override.resultingStatus,
    message: `${base.message} — [الأصل ${base.status}] قرار مهندس موثّق (${identity} / ${role}): ${override.reason} [${override.codeReference}] @ ${override.overriddenAt} → ${override.resultingStatus} — ليس تحققًا آليًا من الكود`,
    reason: `original=${base.status}; override→${override.resultingStatus}; by=${identity}; role=${role}`,
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
  if (mandatoryFail > 0) gateReasons.push(`${mandatoryFail} متطلب إلزامي FAIL`);
  if (mandatoryNeedsData > 0) gateReasons.push(`${mandatoryNeedsData} متطلب إلزامي NEEDS_DATA`);
  if (mandatory.length === 0) {
    gateReasons.push('لا توجد متطلبات إلزامية قابلة للتقييم — NEEDS_DATA ضمني');
  }

  const gate: ComplianceGateDecision = allMandatoryPass ? 'ALLOW' : 'BLOCKED';

  const matrix: ComplianceMatrixRow[] = results.map((r) => ({
    requirement: r.title_ar || r.title,
    code: r.code,
    section: r.section,
    input: formatInputs(r.inputs),
    actual: r.actual_value == null || r.actual_value === '' ? '—' : String(r.actual_value),
    required: r.required_value == null || r.required_value === '' ? '—' : String(r.required_value),
    result: r.status,
    evidence: formatEvidenceList(r.evidence),
    engineerOverride: r.override
      ? `قرار مهندس (ليس تحققًا آليًا من الكود) [أصل ${r.status}] ${r.override.engineerName || r.override.engineerUserId || '?'} — ${r.override.reason} (${r.override.codeReference}) @ ${r.override.overriddenAt} → ${r.override.resultingStatus}`
      : '—',
    status: r.effectiveStatus,
    code_reference: r.code_reference || r.section || '—',
    required_value_source: r.required_value_source || undefined,
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
  const lines = ['بوابة المطابقة الكودية (SBC): الحالة BLOCKED', ...run.gateReasons];
  const samples = run.results
    .filter(
      (r) =>
        r.severity === 'mandatory' &&
        (r.effectiveStatus === 'FAIL' || r.effectiveStatus === 'NEEDS_DATA')
    )
    .slice(0, 6)
    .map((r) => `• ${r.ruleId} ${r.title_ar || r.title}: ${r.effectiveStatus}`);
  return [...lines, ...samples];
}

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
