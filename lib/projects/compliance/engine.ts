/**
 * Central Saudi Code Compliance Engine runner.
 * Deterministic rules only — AI outputs are never final authority.
 */

import { buildComplianceContext } from '@/lib/projects/compliance/context';
import { applyOverride, summarizeResults } from '@/lib/projects/compliance/results';
import { COMPLIANCE_RULES } from '@/lib/projects/compliance/rules';
import type {
  ComplianceRule,
  ComplianceRuleContext,
  ComplianceRuleResult,
  ComplianceRunResult,
  EngineerOverride,
} from '@/lib/projects/compliance/types';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export function evaluateRule(
  rule: ComplianceRule,
  ctx: ComplianceRuleContext
): ComplianceRuleResult {
  const ev = rule.evaluate(ctx);
  return {
    ruleId: rule.id,
    code: rule.code,
    section: rule.section,
    title: rule.title,
    title_ar: rule.title_ar,
    severity: rule.severity,
    applicability: rule.applicability.description,
    requiredInputs: rule.requiredInputs,
    status: ev.status,
    effectiveStatus: ev.status,
    message: ev.message,
    reason: ev.reason || ev.message,
    inputs: ev.inputs || {},
    evidence: ev.evidence || [],
    remediation: ev.remediation,
    override: null,
    evidenceRequired: rule.evidenceRequired,
    actual_value: ev.actual_value,
    required_value: ev.required_value,
    unit: ev.unit,
    occupancy: ev.occupancy,
    condition: ev.condition,
    code_reference: ev.code_reference,
    required_value_source: ev.required_value_source,
    missing_data: ev.missing_data,
    source_code: ev.source_code,
    source_edition: ev.source_edition,
    source_section: ev.source_section,
    source_table: ev.source_table,
    measured_value: ev.measured_value,
    decision: ev.decision,
  };
}

export function runComplianceRules(
  ctx: ComplianceRuleContext,
  rules: ComplianceRule[] = COMPLIANCE_RULES
): ComplianceRunResult {
  const overrideMap = new Map((ctx.overrides || []).map((o) => [o.ruleId, o]));
  const results = rules.map((rule) => {
    const base = evaluateRule(rule, ctx);
    return applyOverride(base, overrideMap.get(rule.id));
  });
  const summary = summarizeResults(results);
  return { ...summary, evaluatedAt: ctx.evaluatedAt || summary.evaluatedAt };
}

export function runProjectCompliance(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  overrides?: EngineerOverride[];
  rules?: ComplianceRule[];
}): ComplianceRunResult {
  const ctx = buildComplianceContext({
    client: params.client,
    data: params.data,
    overrides: params.overrides,
  });
  return runComplianceRules(ctx, params.rules || COMPLIANCE_RULES);
}

export function isFullyCompliant(run: ComplianceRunResult): boolean {
  return run.allMandatoryPass && run.gate === 'ALLOW';
}

/**
 * Never claim absolute “SBC/Civil Defense compliant”.
 * Labels describe assessment state based on documented rules/data only.
 */
export function complianceStatusLabelAr(run: ComplianceRunResult): string {
  if (isFullyCompliant(run)) {
    return 'تقييم مطابقة وفق القواعد/البيانات الموثّقة — اجتياز المتطلبات الإلزامية';
  }
  if (run.mandatoryFail > 0) return 'تقييم مطابقة — عدم اجتياز متطلب إلزامي';
  if (run.counts.BLOCKED > 0) return 'تقييم مطابقة — مرجع كودي ناقص (BLOCKED)';
  if (run.mandatoryNeedsData > 0) return 'تقييم مطابقة — يحتاج بيانات/مراجع موثّقة';
  return 'تقييم مطابقة — غير مكتمل';
}

export const COMPLIANCE_ASSESSMENT_DISCLAIMER_AR =
  'تقييم المطابقة بناءً على البيانات والقواعد الكودية الموثقة — Compliance assessment based on documented rules/data. ليس إعلانًا مطلقًا بمطابقة SBC أو الدفاع المدني.';
