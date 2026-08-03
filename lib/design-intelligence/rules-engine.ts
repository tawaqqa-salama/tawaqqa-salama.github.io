/**
 * Engineering Rules Engine
 * ----------------------
 * AI must NOT invent engineering values. Every field is resolved from
 * configurable rules (seed catalog + optional Supabase `di_engineering_rules`).
 *
 * Cascade: changing an upstream field clears invalid downstream values and
 * re-evaluates locked/computed dependents.
 */

import { ENGINEERING_FIELDS, ENGINEERING_RULES_SEED } from '@/lib/design-intelligence/rules-catalog';
import type {
  EngineeringFieldDef,
  EngineeringFieldKey,
  EngineeringFieldState,
  EngineeringFormState,
  EngineeringOption,
  EngineeringRuleRow,
  EngineeringSelection,
} from '@/lib/design-intelligence/rules-types';
import { isDemoMode, supabase } from '@/lib/supabase';

let cachedRules: EngineeringRuleRow[] | null = null;
let cachedFields: EngineeringFieldDef[] | null = null;

function asArray(v: string | string[] | null | undefined): string[] {
  if (v == null || v === '') return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

function conditionMatches(
  when: Record<string, string | string[]>,
  selection: EngineeringSelection
): boolean {
  const keys = Object.keys(when || {});
  if (!keys.length) return true;
  return keys.every((key) => {
    const expected = asArray(when[key]);
    const actual = asArray(selection[key as EngineeringFieldKey]);
    if (!actual.length) return false;
    // multi-select field: match if any overlap; single: exact membership
    return expected.some((e) => actual.includes(e));
  });
}

function mergeOptions(lists: EngineeringOption[][]): EngineeringOption[] {
  const map = new Map<string, EngineeringOption>();
  for (const list of lists) {
    for (const opt of list) {
      if (!map.has(opt.value)) map.set(opt.value, opt);
    }
  }
  return Array.from(map.values());
}

function normalizeSetValue(v: unknown): string | string[] | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  return null;
}

export function getEngineeringFields(): EngineeringFieldDef[] {
  return (cachedFields || ENGINEERING_FIELDS)
    .filter((f) => f.is_active !== false)
    .slice()
    .sort((a, b) => a.cascade_order - b.cascade_order);
}

export function getEngineeringRules(): EngineeringRuleRow[] {
  return (cachedRules || ENGINEERING_RULES_SEED).filter((r) => r.is_active !== false);
}

/** Load rules from Supabase when available; fall back to seed catalog. */
export async function loadEngineeringRulesFromDb(): Promise<{
  fields: EngineeringFieldDef[];
  rules: EngineeringRuleRow[];
  source: 'supabase' | 'seed';
}> {
  if (isDemoMode) {
    cachedFields = ENGINEERING_FIELDS;
    cachedRules = ENGINEERING_RULES_SEED;
    return { fields: ENGINEERING_FIELDS, rules: ENGINEERING_RULES_SEED, source: 'seed' };
  }
  try {
    const [fieldsRes, rulesRes] = await Promise.all([
      supabase.from('di_engineering_fields').select('*').eq('is_active', true).order('cascade_order'),
      supabase
        .from('di_engineering_rules')
        .select('*')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('priority'),
    ]);
    if (!fieldsRes.error && fieldsRes.data?.length) {
      cachedFields = fieldsRes.data.map((row) => ({
        field_key: row.field_key,
        label_en: row.label_en,
        label_ar: row.label_ar,
        value_kind: row.value_kind,
        depends_on: row.depends_on || [],
        cascade_order: row.cascade_order,
        is_active: row.is_active,
      }));
    } else {
      cachedFields = ENGINEERING_FIELDS;
    }
    if (!rulesRes.error && rulesRes.data?.length) {
      cachedRules = rulesRes.data.map((row) => ({
        id: row.id,
        rule_code: row.rule_code,
        field_key: row.field_key,
        when_conditions: (row.when_conditions || {}) as Record<string, string | string[]>,
        allowed_options: row.allowed_options as EngineeringOption[] | null,
        set_value: row.set_value as string | string[] | null,
        lock_field: !!row.lock_field,
        hide_when_empty: !!row.hide_when_empty,
        explanation_en: row.explanation_en || '',
        explanation_ar: row.explanation_ar || '',
        code_refs: row.code_refs || [],
        priority: row.priority ?? 100,
        version_label: row.version_label || '1.0',
        is_active: row.is_active !== false,
      }));
      return { fields: getEngineeringFields(), rules: getEngineeringRules(), source: 'supabase' };
    }
  } catch {
    /* seed fallback */
  }
  cachedFields = ENGINEERING_FIELDS;
  cachedRules = ENGINEERING_RULES_SEED;
  return { fields: ENGINEERING_FIELDS, rules: ENGINEERING_RULES_SEED, source: 'seed' };
}

/** Upsert seed rules into Supabase (admin / migration helper). */
export async function syncSeedRulesToSupabase(): Promise<{ ok: boolean; count: number; error?: string }> {
  if (isDemoMode) return { ok: false, count: 0, error: 'demo mode' };
  const payload = ENGINEERING_RULES_SEED.map((r) => ({
    rule_code: r.rule_code,
    field_key: r.field_key,
    when_conditions: r.when_conditions,
    allowed_options: r.allowed_options || null,
    set_value: r.set_value ?? null,
    lock_field: !!r.lock_field,
    explanation_en: r.explanation_en,
    explanation_ar: r.explanation_ar || '',
    code_refs: r.code_refs,
    priority: r.priority,
    version_label: r.version_label,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('di_engineering_rules').upsert(payload, {
    onConflict: 'rule_code',
  });
  // unique index is composite — fall back to delete+insert per code if upsert key fails
  if (error) {
    for (const row of payload) {
      await supabase.from('di_engineering_rules').delete().eq('rule_code', row.rule_code).is('company_id', null);
      await supabase.from('di_engineering_rules').insert(row);
    }
  }
  cachedRules = null;
  await loadEngineeringRulesFromDb();
  return { ok: true, count: payload.length, error: error?.message };
}

function matchingRulesForField(
  fieldKey: string,
  selection: EngineeringSelection,
  rules: EngineeringRuleRow[]
): EngineeringRuleRow[] {
  return rules
    .filter((r) => r.field_key === fieldKey && conditionMatches(r.when_conditions, selection))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Evaluate full form state from current selection.
 * Invalid selected values are cleared; locked values overwritten from rules.
 */
export function evaluateEngineeringForm(selection: EngineeringSelection): EngineeringFormState {
  const fields = getEngineeringFields();
  const rules = getEngineeringRules();
  const next: EngineeringSelection = { ...selection };
  const states: EngineeringFieldState[] = [];
  const violations: EngineeringFormState['violations'] = [];

  for (const field of fields) {
    const key = field.field_key as EngineeringFieldKey;
    const matched = matchingRulesForField(field.field_key, next, rules);

    const optionLists = matched
      .map((r) => r.allowed_options || [])
      .filter((list) => list.length) as EngineeringOption[][];
    let options = mergeOptions(optionLists);

    // Prefer highest-priority (lowest number) lock/set among matched
    const lockRule = matched.find((r) => r.lock_field && r.set_value != null);
    const setRule = lockRule || matched.find((r) => r.set_value != null);

    let locked =
      !!lockRule ||
      field.value_kind === 'computed' ||
      field.value_kind === 'multi' ||
      !!setRule?.lock_field;
    let value: string | string[] | null = next[key] ?? null;
    let explanation = '';
    let explanation_ar = '';
    let code_refs: string[] = [];
    const matched_rule_codes = matched.map((r) => r.rule_code);

    if (setRule) {
      const forced = normalizeSetValue(setRule.set_value);
      // Locked / computed / multi always take rule value; never leave AI/user free text
      if (forced != null && (locked || field.value_kind === 'computed' || field.value_kind === 'multi')) {
        value = forced;
      } else if (forced != null && value == null) {
        value = forced;
      }
      explanation = setRule.explanation_en;
      explanation_ar = setRule.explanation_ar || setRule.explanation_en;
      code_refs = setRule.code_refs;
    } else if (matched[0]) {
      explanation = matched[0].explanation_en;
      explanation_ar = matched[0].explanation_ar || matched[0].explanation_en;
      code_refs = matched[0].code_refs;
    } else if (field.value_kind === 'computed' || field.value_kind === 'multi') {
      // No matching rule yet — keep empty (do not invent values)
      value = null;
    }

    // Validate selectable value against allowed options (invalid never sticks)
    if (field.value_kind === 'select' && value != null) {
      const v = String(Array.isArray(value) ? value[0] : value);
      if (options.length && !options.some((o) => o.value === v)) {
        violations.push({
          field_key: field.field_key,
          message: `Value «${v}» is not allowed for current upstream selections.`,
          code_refs,
        });
        value = locked && setRule ? normalizeSetValue(setRule.set_value) : null;
      } else if (!options.length && !locked) {
        value = null;
      }
    }

    // Auto-pick sole option when unlocked select has exactly one valid choice
    if (field.value_kind === 'select' && !locked && value == null && options.length === 1) {
      value = options[0].value;
    }

    // If locked with set_value that isn't in options, expose it as synthetic option for display
    if (locked && value != null && field.value_kind === 'select') {
      const v = String(Array.isArray(value) ? value[0] : value);
      if (!options.some((o) => o.value === v)) {
        options = [{ value: v, label_en: v, label_ar: v }, ...options];
      }
    }

    // Visibility: root always; else show when rules produced options or a locked/computed value.
    // Matching rules already encode parent conditions — no need to block on sibling depends_on.
    const visible =
      field.cascade_order === 10 || options.length > 0 || (value != null && matched.length > 0);

    next[key] = value;

    // Multi locked lists: ensure array
    if (field.value_kind === 'multi' && value != null && !Array.isArray(value)) {
      next[key] = [String(value)];
      value = next[key]!;
    }

    states.push({
      field_key: field.field_key,
      label_en: field.label_en,
      label_ar: field.label_ar,
      value_kind: field.value_kind,
      value,
      options,
      locked,
      visible,
      explanation,
      explanation_ar,
      code_refs,
      matched_rule_codes,
    });
  }

  return { selection: next, fields: states, violations };
}

/**
 * Apply a user change to one field, clear all downstream fields, re-evaluate.
 * Rejects values not in allowed options for that field.
 */
export function applyEngineeringChange(
  selection: EngineeringSelection,
  fieldKey: EngineeringFieldKey | string,
  newValue: string | string[] | null
): EngineeringFormState {
  const fields = getEngineeringFields();
  const order = fields.find((f) => f.field_key === fieldKey)?.cascade_order ?? 0;
  const cleared: EngineeringSelection = { ...selection, [fieldKey]: newValue };

  for (const f of fields) {
    if (f.cascade_order > order) {
      cleared[f.field_key as EngineeringFieldKey] = null;
    }
  }

  // Validate the changed field against rules with upstream-only context
  const upstreamOnly: EngineeringSelection = {};
  for (const f of fields) {
    if (f.cascade_order < order) {
      upstreamOnly[f.field_key as EngineeringFieldKey] = cleared[f.field_key as EngineeringFieldKey];
    }
  }
  upstreamOnly[fieldKey as EngineeringFieldKey] = newValue;

  const preview = evaluateEngineeringForm(upstreamOnly);
  const state = preview.fields.find((f) => f.field_key === fieldKey);
  if (state && state.value_kind === 'select' && newValue != null && state.options.length) {
    const v = String(Array.isArray(newValue) ? newValue[0] : newValue);
    if (!state.options.some((o) => o.value === v)) {
      // illegal — keep previous selection for that field
      cleared[fieldKey as EngineeringFieldKey] = selection[fieldKey as EngineeringFieldKey] ?? null;
    }
  }

  return evaluateEngineeringForm(cleared);
}

/** AI-facing helper: only return valid recommendations from the rule engine. */
export function recommendFromRules(selection: EngineeringSelection): {
  recommendations: {
    field_key: string;
    label_en: string;
    valid_options: EngineeringOption[];
    locked_value: string | string[] | null;
    explanation: string;
    code_refs: string[];
  }[];
  note: string;
} {
  const form = evaluateEngineeringForm(selection);
  return {
    note: 'AI may only explain and recommend options already allowed by the Engineering Rules Engine. It must not invent densities, pump capacities, or tank sizes.',
    recommendations: form.fields
      .filter((f) => f.visible)
      .map((f) => ({
        field_key: f.field_key,
        label_en: f.label_en,
        valid_options: f.locked ? [] : f.options,
        locked_value: f.locked ? f.value : null,
        explanation: f.explanation,
        code_refs: f.code_refs,
      })),
  };
}

export function selectionFromWorkspace(ws: {
  building_info?: Record<string, unknown>;
  occupancy?: string | null;
  risk_classification?: string | null;
  applicable_codes?: string[];
}): EngineeringSelection {
  return {
    building_type: (ws.building_info?.building_type as string) || null,
    occupancy: ws.occupancy || null,
    risk_classification: ws.risk_classification || null,
    applicable_codes: ws.applicable_codes || null,
  };
}
