/**
 * Engineering Decision Engine
 * ---------------------------
 * Active controller over engineering workflows. The Rules Engine is the
 * single source of truth. The engineer may only select compliant values;
 * the engine locks, auto-fills, recalculates, and blocks violations.
 */

import {
  applyEngineeringChange,
  evaluateEngineeringForm,
  recommendFromRules,
} from '@/lib/design-intelligence/rules-engine';
import type {
  EngineeringDecisionAssertion,
  EngineeringFieldKey,
  EngineeringFormState,
  EngineeringSelection,
  FieldDecisionExplanation,
} from '@/lib/design-intelligence/rules-types';

/** Alias — Decision Engine evaluate (rules as source of truth). */
export function decideEngineeringForm(selection: EngineeringSelection): EngineeringFormState {
  return evaluateEngineeringForm(selection);
}

/**
 * Commit a user selection through the Decision Engine.
 * Rejects edits to locked fields and illegal option values; clears +
 * recalculates all downstream dependents.
 */
export function commitEngineeringDecision(
  selection: EngineeringSelection,
  fieldKey: EngineeringFieldKey | string,
  newValue: string | string[] | null
): EngineeringFormState {
  const current = evaluateEngineeringForm(selection);
  const target = current.fields.find((f) => f.field_key === fieldKey);

  if (target?.locked) {
    // Hard block — locked fields are engine-owned
    return {
      ...current,
      violations: [
        ...current.violations.filter((v) => v.field_key !== fieldKey),
        {
          field_key: String(fieldKey),
          message: `Field «${fieldKey}» is locked by the Engineering Decision Engine and cannot be changed.`,
          code_refs: target.code_refs,
        },
      ],
    };
  }

  if (target && target.value_kind === 'select' && newValue != null && target.options.length) {
    const v = String(Array.isArray(newValue) ? newValue[0] : newValue);
    if (!target.options.some((o) => o.value === v)) {
      return {
        ...current,
        violations: [
          ...current.violations.filter((v) => v.field_key !== fieldKey),
          {
            field_key: String(fieldKey),
            message: `«${v}» violates SBC / NFPA / Civil Defense / company rules for the current cascade.`,
            code_refs: target.code_refs,
          },
        ],
      };
    }
  }

  return applyEngineeringChange(selection, fieldKey, newValue);
}

/** Workflow gate — block save/advance when non-compliant. */
export function assertEngineeringDecision(
  selectionOrForm: EngineeringSelection | EngineeringFormState
): EngineeringDecisionAssertion {
  const form =
    'fields' in selectionOrForm
      ? selectionOrForm
      : evaluateEngineeringForm(selectionOrForm);

  const blockingViolations = form.violations.map((v) => ({ ...v }));
  const missingRequired = form.fields
    .filter(
      (f) =>
        f.visible &&
        !f.locked &&
        f.value_kind === 'select' &&
        (f.value == null || f.value === '') &&
        f.options.length > 0
    )
    .map((f) => ({
      field_key: f.field_key,
      label_en: f.label_en,
      label_ar: f.label_ar,
    }));

  const lockedFields = form.fields.filter((f) => f.locked && f.visible).map((f) => f.field_key);
  const autoSelectedFields = form.fields
    .filter((f) => f.auto_selected && f.visible)
    .map((f) => f.field_key);

  const ok = blockingViolations.length === 0 && missingRequired.length === 0;

  return {
    ok,
    blockingViolations,
    missingRequired,
    lockedFields,
    autoSelectedFields,
    summary_en: ok
      ? 'Engineering Decision Engine: cascade is compliant. Downstream values are locked/auto-filled by rules.'
      : `Blocked: ${blockingViolations.length} violation(s), ${missingRequired.length} required field(s) incomplete.`,
    summary_ar: ok
      ? 'محرك القرار الهندسي: التسلسل متوافق. القيم التابعة مقفلة/تُملأ تلقائياً حسب القواعد.'
      : `موقوف: ${blockingViolations.length} مخالفة، و${missingRequired.length} حقل إلزامي ناقص.`,
  };
}

/** Structured rationale for every visible field (replaces passive “recommendations”). */
export function explainEngineeringDecisions(
  selection: EngineeringSelection
): {
  note_en: string;
  note_ar: string;
  decisions: FieldDecisionExplanation[];
  assertion: EngineeringDecisionAssertion;
} {
  const form = evaluateEngineeringForm(selection);
  const assertion = assertEngineeringDecision(form);
  const decisions: FieldDecisionExplanation[] = form.fields
    .filter((f) => f.visible)
    .map((f) => ({
      field_key: f.field_key,
      label_en: f.label_en,
      label_ar: f.label_ar,
      control_mode: f.control_mode,
      value: f.value,
      valid_options: f.locked ? [] : f.options,
      reason_en:
        f.decision_reason_en ||
        f.explanation ||
        (f.locked ? 'Locked by Engineering Rules Engine.' : 'Selectable from rule-allowed options only.'),
      reason_ar:
        f.decision_reason_ar ||
        f.explanation_ar ||
        f.explanation ||
        (f.locked ? 'مقفل بواسطة محرك القواعد الهندسية.' : 'يُختار فقط من القيم المسموحة بالقواعد.'),
      code_refs: f.code_refs,
      matched_rule_codes: f.matched_rule_codes,
      blocked: form.violations.some((v) => v.field_key === f.field_key),
    }));

  return {
    note_en:
      'Engineering Decision Engine controls this cascade. Values come only from the Rules Engine (SBC / NFPA / Civil Defense / company). AI does not invent engineering numbers.',
    note_ar:
      'محرك القرار الهندسي يتحكم في هذا التسلسل. القيم من محرك القواعد فقط (SBC / NFPA / الدفاع المدني / قواعد الشركة). الذكاء الاصطناعي لا يخترع أرقاماً هندسية.',
    decisions,
    assertion,
  };
}

/** @deprecated Use explainEngineeringDecisions — kept for callers during transition */
export function recommendFromRulesCompat(selection: EngineeringSelection) {
  return recommendFromRules(selection);
}
