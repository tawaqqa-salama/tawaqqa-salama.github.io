/**
 * NFPA 13 numeric / conditional rule evaluator.
 *
 * Never invents thresholds. PASS/FAIL only with a complete encoded row
 * (platform table or project_adopted_mapping) matching edition + applicability.
 */

import {
  getNfpa13RuleDefinition,
  resolveNfpa13EncodedRow,
  type Nfpa13EncodedRow,
  type Nfpa13RuleDefinition,
} from '@/lib/projects/compliance/nfpa/nfpa13-tables';
import { finding, statusFromInputState } from '@/lib/projects/compliance/nfpa/helpers';
import type { Nfpa13Context, NfpaRuleFinding } from '@/lib/projects/compliance/nfpa/types';
import type { ResolverState } from '@/lib/projects/compliance/resolvers';

type FieldBox = { state: ResolverState; value: unknown };

function fieldFor(ctx: Nfpa13Context, parameter: string): FieldBox {
  const map: Record<string, FieldBox> = {
    hazard_class: ctx.hazard_class,
    sprinkler_type: ctx.sprinkler_type,
    sprinkler_system_type: ctx.sprinkler_system_type,
    design_area_m2: ctx.design_area_m2,
    density_lpm_m2: ctx.density_lpm_m2,
    sprinkler_spacing_m: ctx.sprinkler_spacing_m,
    max_coverage_m2: ctx.max_coverage_m2,
    remote_area_m2: ctx.remote_area_m2,
    hose_allowance_lpm: ctx.hose_allowance_lpm,
    water_demand_lpm: ctx.water_demand_lpm,
    hydraulic_network_complete: ctx.hydraulic_network_complete,
    available_water_supply: ctx.available_water_supply,
    k_factor: ctx.k_factor,
    occupancy: ctx.occupancy,
  };
  return map[parameter] || { state: 'MISSING', value: null };
}

function requiredValueFromRow(def: Nfpa13RuleDefinition, row: Nfpa13EncodedRow): string | number | boolean | null {
  if (def.compare === 'numeric_min') return row.minimum ?? row.value ?? null;
  if (def.compare === 'numeric_max') return row.maximum ?? row.value ?? null;
  if (def.compare === 'numeric_eq') return row.value ?? row.minimum ?? null;
  if (def.compare === 'categorical_in') {
    return row.allowed_values?.length ? row.allowed_values.join(' | ') : (row.value as string | null) ?? null;
  }
  if (def.compare === 'presence_true') return true;
  return null;
}

function rowSupportsCompare(def: Nfpa13RuleDefinition, row: Nfpa13EncodedRow): boolean {
  if (def.compare === 'numeric_min') {
    const v = row.minimum ?? (typeof row.value === 'number' ? row.value : null);
    return v != null && Number.isFinite(v);
  }
  if (def.compare === 'numeric_max') {
    const v = row.maximum ?? (typeof row.value === 'number' ? row.value : null);
    return v != null && Number.isFinite(v);
  }
  if (def.compare === 'numeric_eq') {
    return row.value != null && row.value !== '' && (typeof row.value !== 'number' || Number.isFinite(row.value));
  }
  if (def.compare === 'categorical_in') {
    return Boolean(row.allowed_values?.length) || typeof row.value === 'string';
  }
  if (def.compare === 'presence_true') return true;
  return false;
}

function compareActual(
  def: Nfpa13RuleDefinition,
  actual: unknown,
  row: Nfpa13EncodedRow
): 'PASS' | 'FAIL' | null {
  if (!rowSupportsCompare(def, row)) return null;

  if (def.compare === 'numeric_min') {
    const a = typeof actual === 'number' ? actual : Number(actual);
    const min = Number(row.minimum ?? row.value);
    if (!Number.isFinite(a) || !Number.isFinite(min)) return null;
    return a >= min ? 'PASS' : 'FAIL';
  }
  if (def.compare === 'numeric_max') {
    const a = typeof actual === 'number' ? actual : Number(actual);
    const max = Number(row.maximum ?? row.value);
    if (!Number.isFinite(a) || !Number.isFinite(max)) return null;
    return a <= max ? 'PASS' : 'FAIL';
  }
  if (def.compare === 'numeric_eq') {
    if (typeof row.value === 'number') {
      const a = typeof actual === 'number' ? actual : Number(actual);
      if (!Number.isFinite(a)) return null;
      return a === row.value ? 'PASS' : 'FAIL';
    }
    return String(actual).trim() === String(row.value).trim() ? 'PASS' : 'FAIL';
  }
  if (def.compare === 'categorical_in') {
    const allowed =
      row.allowed_values?.length
        ? row.allowed_values
        : typeof row.value === 'string'
          ? [row.value]
          : [];
    const a = String(actual ?? '').trim().toLowerCase();
    return allowed.some((x) => x.trim().toLowerCase() === a) ? 'PASS' : 'FAIL';
  }
  if (def.compare === 'presence_true') {
    return actual === true ? 'PASS' : 'FAIL';
  }
  return null;
}

/**
 * Evaluate one NFPA 13 rule definition against canonical context + encoded rows.
 */
export function evaluateNfpa13NumericRule(params: {
  rule_id: string;
  ctx: Nfpa13Context;
  def?: Nfpa13RuleDefinition;
}): NfpaRuleFinding {
  const def = params.def || getNfpa13RuleDefinition(params.rule_id);
  if (!def) {
    return finding({
      code: 'NFPA-13',
      edition: params.ctx.nfpa13_edition.value,
      rule_id: params.rule_id,
      field: params.rule_id,
      status: 'RULE_NOT_CONFIGURED',
      explanation_ar: `${params.rule_id}: تعريف القاعدة غير موجود.`,
      explanation_en: `${params.rule_id}: rule definition missing.`,
    });
  }

  const input = fieldFor(params.ctx, def.parameter);
  const editionBox = params.ctx.nfpa13_edition;

  const blocked = statusFromInputState(input.state);
  if (blocked) {
    return finding({
      code: 'NFPA-13',
      edition: editionBox.value,
      rule_id: def.rule_id,
      field: def.parameter,
      status: blocked,
      actual_value: null,
      unit: def.unit,
      input_state: input.state,
      explanation_ar: `${def.label_ar}: حالة المدخل ${input.state} — لا تقييم رقمي.`,
      explanation_en: `${def.label_en}: input state ${input.state} — no numeric evaluation.`,
    });
  }

  if (editionBox.state === 'CONFLICT') {
    return finding({
      code: 'NFPA-13',
      edition: null,
      rule_id: def.rule_id,
      field: def.parameter,
      status: 'CONFLICT',
      actual_value: input.value as string | number | boolean | null,
      unit: def.unit,
      input_state: input.state,
      explanation_ar: `${def.label_ar}: تعارض طبعة NFPA 13 الكانونية — CONFLICT.`,
      explanation_en: `${def.label_en}: canonical NFPA 13 edition CONFLICT.`,
    });
  }

  if (editionBox.state !== 'VALID' || !editionBox.value) {
    return finding({
      code: 'NFPA-13',
      edition: null,
      rule_id: def.rule_id,
      field: def.parameter,
      status: 'RULE_NOT_CONFIGURED',
      actual_value: input.value as string | number | boolean | null,
      unit: def.unit,
      input_state: input.state,
      explanation_ar: `${def.label_ar}: الطبعة غير موثّقة — RULE_NOT_CONFIGURED (لا PASS بدون طبعة).`,
      explanation_en: `${def.label_en}: edition missing — RULE_NOT_CONFIGURED (no PASS without edition).`,
    });
  }

  // Applicability must be known when the rule is conditional
  for (const key of def.required_applicability) {
    const box =
      key === 'occupancy'
        ? params.ctx.occupancy
        : key === 'hazard'
          ? params.ctx.hazard_class
          : key === 'sprinkler_type'
            ? params.ctx.sprinkler_type
            : key === 'system_type'
              ? params.ctx.sprinkler_system_type
              : null;
    if (!box || box.state === 'MISSING' || box.state === 'INVALID') {
      return finding({
        code: 'NFPA-13',
        edition: editionBox.value,
        rule_id: def.rule_id,
        field: def.parameter,
        status: 'NEEDS_DATA',
        actual_value: input.value as string | number | boolean | null,
        unit: def.unit,
        input_state: input.state,
        explanation_ar: `${def.label_ar}: شرط التطبيق (${key}) غير معروف — لا PASS.`,
        explanation_en: `${def.label_en}: applicability (${key}) unknown — no PASS.`,
      });
    }
    if (box.state === 'CONFLICT') {
      return finding({
        code: 'NFPA-13',
        edition: editionBox.value,
        rule_id: def.rule_id,
        field: def.parameter,
        status: 'CONFLICT',
        actual_value: input.value as string | number | boolean | null,
        unit: def.unit,
        input_state: input.state,
        explanation_ar: `${def.label_ar}: تعارض شرط التطبيق (${key}).`,
        explanation_en: `${def.label_en}: applicability CONFLICT (${key}).`,
      });
    }
  }

  const applicability = {
    occupancy: params.ctx.occupancy.state === 'VALID' ? params.ctx.occupancy.value : null,
    hazard: params.ctx.hazard_class.state === 'VALID' ? params.ctx.hazard_class.value : null,
    sprinkler_type: params.ctx.sprinkler_type.state === 'VALID' ? params.ctx.sprinkler_type.value : null,
    system_type:
      params.ctx.sprinkler_system_type.state === 'VALID' ? params.ctx.sprinkler_system_type.value : null,
  };

  const resolved = resolveNfpa13EncodedRow({
    rule_id: def.rule_id,
    edition: editionBox.value,
    applicability,
    projectRows: params.ctx.project_rule_rows,
  });

  if (!resolved.row) {
    // Detect edition mismatch: rows exist for this rule but different edition
    const otherEdition = (params.ctx.project_rule_rows || []).some(
      (r) =>
        r.rule_id === def.rule_id &&
        r.encoding_source === 'project_adopted_mapping' &&
        String(r.edition).trim() &&
        String(r.edition).trim() !== editionBox.value
    );
    return finding({
      code: 'NFPA-13',
      edition: editionBox.value,
      rule_id: def.rule_id,
      field: def.parameter,
      status: 'RULE_NOT_CONFIGURED',
      actual_value: input.value as string | number | boolean | null,
      unit: def.unit,
      input_state: input.state,
      explanation_ar: otherEdition
        ? `${def.label_ar}: صف مرمّز موجود لطبعة مختلفة — عدم تطابق الطبعة → RULE_NOT_CONFIGURED.`
        : `${def.label_ar}: لا صف مرمّز (منصة/مشروع) للطبعة ${editionBox.value} وشروط التطبيق — RULE_NOT_CONFIGURED.`,
      explanation_en: otherEdition
        ? `${def.label_en}: encoded row exists for a different edition — edition mismatch → RULE_NOT_CONFIGURED.`
        : `${def.label_en}: no encoded row (platform/project) for edition ${editionBox.value} + applicability — RULE_NOT_CONFIGURED.`,
    });
  }

  const decision = compareActual(def, input.value, resolved.row);
  if (!decision) {
    return finding({
      code: 'NFPA-13',
      edition: editionBox.value,
      rule_id: def.rule_id,
      field: def.parameter,
      status: 'RULE_NOT_CONFIGURED',
      actual_value: input.value as string | number | boolean | null,
      required_value: requiredValueFromRow(def, resolved.row),
      unit: def.unit || resolved.row.unit,
      input_state: input.state,
      explanation_ar: `${def.label_ar}: الصف ناقص قيمة/نطاق للمقارنة — RULE_NOT_CONFIGURED.`,
      explanation_en: `${def.label_en}: encoded row missing comparable value/range — RULE_NOT_CONFIGURED.`,
    });
  }

  const required = requiredValueFromRow(def, resolved.row);
  return finding({
    code: 'NFPA-13',
    edition: editionBox.value,
    rule_id: def.rule_id,
    field: def.parameter,
    status: decision,
    actual_value: input.value as string | number | boolean | null,
    required_value: required,
    unit: def.unit || resolved.row.unit,
    input_state: input.state,
    explanation_ar:
      decision === 'PASS'
        ? `${def.label_ar}: PASS وفق ${resolved.row.source} §${resolved.row.section}. ${resolved.row.explanation_ar}`
        : `${def.label_ar}: FAIL وفق ${resolved.row.source} §${resolved.row.section}. ${resolved.row.explanation_ar}`,
    explanation_en:
      decision === 'PASS'
        ? `${def.label_en}: PASS per ${resolved.row.source} §${resolved.row.section}. ${resolved.row.explanation_en}`
        : `${def.label_en}: FAIL per ${resolved.row.source} §${resolved.row.section}. ${resolved.row.explanation_en}`,
  });
}
