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
    inputs: ev.inputs || {},
    evidence: ev.evidence || [],
    remediation: ev.remediation,
    override: null,
    evidenceRequired: rule.evidenceRequired,
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

/**
 * Project-level entry: build context from live engineering data and run all rules.
 */
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

/**
 * Overall compliance claim — "مطابق" only when all mandatory rules PASS.
 */
export function isFullyCompliant(run: ComplianceRunResult): boolean {
  return run.allMandatoryPass && run.gate === 'ALLOW';
}

export function complianceStatusLabelAr(run: ComplianceRunResult): string {
  if (isFullyCompliant(run)) return 'مطابق';
  if (run.mandatoryFail > 0) return 'غير مطابق';
  if (run.mandatoryNeedsData > 0) return 'يحتاج بيانات';
  return 'غير مكتمل';
}
