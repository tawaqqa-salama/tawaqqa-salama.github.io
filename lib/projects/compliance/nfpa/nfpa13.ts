/**
 * NFPA 13 rules — architecture + numeric evaluator.
 *
 * Numeric PASS/FAIL only via platform table (empty) or project_adopted_mapping.
 * No invented density/spacing/hose/demand thresholds.
 */

import type { Nfpa13Context, NfpaRuleFinding } from '@/lib/projects/compliance/nfpa/types';
import { NFPA13_RULE_DEFINITIONS } from '@/lib/projects/compliance/nfpa/nfpa13-tables';
import { evaluateNfpa13NumericRule } from '@/lib/projects/compliance/nfpa/nfpa13-numeric';

export function evaluateNfpa13(ctx: Nfpa13Context): NfpaRuleFinding[] {
  const edition = ctx.nfpa13_edition;

  // If sprinkler not required → N/A for system-specific rules (keep occupancy/hazard)
  const sprinklerNeeded =
    ctx.sprinkler_required.state === 'VALID' && ctx.sprinkler_required.value === 'yes';
  const sprinklerUnknown =
    ctx.sprinkler_required.state !== 'VALID' || ctx.sprinkler_required.value !== 'no';

  return NFPA13_RULE_DEFINITIONS.map((def) => {
    if (
      !sprinklerNeeded &&
      !sprinklerUnknown &&
      def.rule_id !== 'NFPA13-OCC-HAZARD' &&
      def.parameter !== 'hazard_class'
    ) {
      return {
        code: 'NFPA-13' as const,
        edition: edition.value,
        rule_id: def.rule_id,
        field: def.parameter,
        status: 'N/A' as const,
        actual_value: null,
        required_value: null,
        unit: def.unit,
        explanation_ar: 'نظام المرشات غير مطلوب وفق بيان المشروع — N/A.',
        explanation_en: 'Sprinkler system not required per project record — N/A.',
        source: 'lib/projects/compliance/nfpa',
        authoritative: true as const,
        input_state: ctx.sprinkler_required.state,
      };
    }
    return evaluateNfpa13NumericRule({ rule_id: def.rule_id, ctx, def });
  });
}
