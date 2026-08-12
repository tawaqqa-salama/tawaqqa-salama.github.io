/**
 * Shared NFPA rule helpers — never invent thresholds or editions.
 */

import type { ResolverState } from '@/lib/projects/compliance/resolvers';
import type {
  NfpaRuleFinding,
  NfpaRuleStatus,
  NfpaStandardCode,
} from '@/lib/projects/compliance/nfpa/types';
import { NFPA_AUTHORITY } from '@/lib/projects/compliance/nfpa/types';

export function finding(params: {
  code: NfpaStandardCode;
  edition: string | null;
  rule_id: string;
  field: string;
  status: NfpaRuleStatus;
  actual_value?: string | number | boolean | null;
  required_value?: string | number | boolean | null;
  unit?: string | null;
  explanation_ar: string;
  explanation_en: string;
  input_state?: ResolverState | null;
}): NfpaRuleFinding {
  return {
    code: params.code,
    edition: params.edition,
    rule_id: params.rule_id,
    field: params.field,
    status: params.status,
    actual_value: params.actual_value ?? null,
    required_value: params.required_value ?? null,
    unit: params.unit ?? null,
    explanation_ar: params.explanation_ar,
    explanation_en: params.explanation_en,
    source: NFPA_AUTHORITY,
    authoritative: true,
    input_state: params.input_state ?? null,
  };
}

/** Map resolver state → rule status before any numeric compare. */
export function statusFromInputState(state: ResolverState): NfpaRuleStatus | null {
  if (state === 'MISSING') return 'NEEDS_DATA';
  if (state === 'INVALID') return 'NEEDS_DATA';
  if (state === 'CONFLICT') return 'CONFLICT';
  return null; // VALID — caller continues
}

/**
 * Architecture-phase evaluate: with VALID input, still RULE_NOT_CONFIGURED
 * until edition + table cell are documented (no invented thresholds).
 */
export function evaluateConfiguredOrNeeds(params: {
  code: NfpaStandardCode;
  rule_id: string;
  field: string;
  input: { state: ResolverState; value: unknown };
  edition: { state: ResolverState; value: string | null };
  unit?: string | null;
  label_ar: string;
  label_en: string;
}): NfpaRuleFinding {
  const blocked = statusFromInputState(params.input.state);
  if (blocked) {
    return finding({
      code: params.code,
      edition: params.edition.value,
      rule_id: params.rule_id,
      field: params.field,
      status: blocked,
      actual_value: null,
      unit: params.unit,
      input_state: params.input.state,
      explanation_ar: `${params.label_ar}: حالة المدخل ${params.input.state} — لا تقييم رقمي.`,
      explanation_en: `${params.label_en}: input state ${params.input.state} — no numeric evaluation.`,
    });
  }

  if (params.edition.state !== 'VALID' || !params.edition.value) {
    return finding({
      code: params.code,
      edition: null,
      rule_id: params.rule_id,
      field: params.field,
      status: 'RULE_NOT_CONFIGURED',
      actual_value: params.input.value as string | number | boolean | null,
      unit: params.unit,
      input_state: params.input.state,
      explanation_ar: `${params.label_ar}: المدخل موثّق لكن طبعة/جدول ${params.code} غير مرمّز في المنصة — RULE_NOT_CONFIGURED (لا اختراع عتبة).`,
      explanation_en: `${params.label_en}: input present but ${params.code} edition/table is not encoded — RULE_NOT_CONFIGURED (no invented threshold).`,
    });
  }

  // Edition documented but table cell still not encoded in-platform
  return finding({
    code: params.code,
    edition: params.edition.value,
    rule_id: params.rule_id,
    field: params.field,
    status: 'RULE_NOT_CONFIGURED',
    actual_value: params.input.value as string | number | boolean | null,
    unit: params.unit,
    input_state: params.input.state,
    explanation_ar: `${params.label_ar}: الطبعة ${params.edition.value} موثّقة لكن خلية الجدول غير مرمّزة بعد — RULE_NOT_CONFIGURED.`,
    explanation_en: `${params.label_en}: edition ${params.edition.value} documented but table cell not yet encoded — RULE_NOT_CONFIGURED.`,
  });
}

/** Reject advisory estimate / vision / DI payloads as PASS sources. */
export function rejectAdvisoryPassAttempt(params: {
  code: NfpaStandardCode;
  rule_id: string;
  field: string;
  advisory_source: string;
  advisory_value?: string | number | null;
}): NfpaRuleFinding {
  return finding({
    code: params.code,
    edition: null,
    rule_id: params.rule_id,
    field: params.field,
    status: 'NEEDS_DATA',
    actual_value: params.advisory_value ?? null,
    explanation_ar: `مصدر استرشادي (${params.advisory_source}) لا يُنشئ PASS لـ ${params.code}. يلزم مدخل كانوني + طبعة/جدول مرمّز.`,
    explanation_en: `Advisory source (${params.advisory_source}) cannot create PASS for ${params.code}. Requires canonical input + encoded edition/table.`,
  });
}
