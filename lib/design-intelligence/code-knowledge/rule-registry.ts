/**
 * Edition-aware engineering rule registry (DI advisory cascade rows).
 * Authoritative NFPA evaluation remains in lib/projects/compliance.
 *
 * Shells may exist as RULE_NOT_CONFIGURED with no numeric values.
 */

import {
  getCodeKnowledgeStore,
  nowIso,
  uid,
} from '@/lib/design-intelligence/code-knowledge/store';
import {
  NFPA13_PIPELINE_RULE_IDS,
  type EditionRuleRecord,
  type EngineeringRuleLifecycleStatus,
  type Nfpa13PipelineRuleId,
} from '@/lib/design-intelligence/code-knowledge/types';

const FIELD_BY_RULE: Record<Nfpa13PipelineRuleId, string> = {
  'NFPA13-OCC-HAZARD': 'nfpa13_occ_hazard',
  'NFPA13-SPRINKLER-TYPE': 'nfpa13_sprinkler_type',
  'NFPA13-SYSTEM-TYPE': 'nfpa13_system_type',
  'NFPA13-K-FACTOR': 'nfpa13_k_factor',
  'NFPA13-DESIGN-AREA': 'nfpa13_design_area',
  'NFPA13-DENSITY': 'nfpa13_density',
  'NFPA13-SPACING': 'nfpa13_spacing',
  'NFPA13-MAX-COVERAGE': 'nfpa13_max_coverage',
};

export function listEditionRules(filters?: {
  code?: string;
  edition?: string;
}): EditionRuleRecord[] {
  return getCodeKnowledgeStore().rules.filter((r) => {
    if (filters?.code && r.code !== filters.code) return false;
    if (filters?.edition && r.edition !== filters.edition) return false;
    return true;
  });
}

export function getEditionRule(
  ruleCode: string,
  code: string,
  edition: string
): EditionRuleRecord | null {
  return (
    listEditionRules({ code, edition }).find((r) => r.rule_code === ruleCode) || null
  );
}

/**
 * Register a rule shell for an edition. Never overwrites a different edition.
 * Refuses to set numeric values without verified section/table.
 */
export function registerEditionRule(input: {
  rule_code: string;
  code: string;
  edition: string;
  section?: string | null;
  table_reference?: string | null;
  figure_reference?: string | null;
  source_document_id?: string | null;
  explanation_en?: string;
  explanation_ar?: string;
  numeric_value?: number | null;
  numeric_min?: number | null;
  numeric_max?: number | null;
  unit?: string | null;
  verification_status?: string;
  rule_status?: EngineeringRuleLifecycleStatus | string;
  applicability?: Record<string, unknown>;
  input_fields?: string[];
  output_fields?: string[];
  priority?: number;
  is_active?: boolean;
}): { ok: true; rule: EditionRuleRecord; created: boolean } | { ok: false; error: string } {
  const hasNumeric =
    input.numeric_value != null ||
    input.numeric_min != null ||
    input.numeric_max != null;
  const hasCitation = Boolean(
    String(input.section || '').trim() || String(input.table_reference || '').trim()
  );

  if (hasNumeric && !hasCitation) {
    return { ok: false, error: 'numeric_requires_verified_section_or_table' };
  }

  const existing = getEditionRule(input.rule_code, input.code, input.edition);
  if (existing) {
    // Idempotent metadata refresh — do not invent numbers
    if (!hasCitation) {
      existing.verification_status = 'RULE_NOT_CONFIGURED';
      existing.rule_status = 'rule_not_configured';
      existing.numeric_value = null;
      existing.numeric_min = null;
      existing.numeric_max = null;
      existing.is_active = false;
    }
    return { ok: true, rule: existing, created: false };
  }

  const rule: EditionRuleRecord = {
    id: uid('erule'),
    rule_code: input.rule_code,
    code: input.code,
    edition: input.edition,
    section: input.section ?? null,
    table_reference: input.table_reference ?? null,
    figure_reference: input.figure_reference ?? null,
    source_document_id: input.source_document_id ?? null,
    verification_status:
      input.verification_status ||
      (hasCitation && hasNumeric ? 'VERIFIED' : 'RULE_NOT_CONFIGURED'),
    rule_status:
      input.rule_status ||
      (hasCitation && hasNumeric ? 'draft' : 'rule_not_configured'),
    numeric_value: hasCitation ? input.numeric_value ?? null : null,
    numeric_min: hasCitation ? input.numeric_min ?? null : null,
    numeric_max: hasCitation ? input.numeric_max ?? null : null,
    unit: input.unit ?? null,
    explanation_en: input.explanation_en || '',
    explanation_ar: input.explanation_ar || '',
    priority: input.priority ?? 100,
    is_active: input.is_active ?? false,
    applicability: input.applicability || {},
    input_fields: input.input_fields || [],
    output_fields: input.output_fields || [],
  };

  getCodeKnowledgeStore().rules.push(rule);
  return { ok: true, rule, created: true };
}

/**
 * Seed NFPA 13-2025 Phase 1 rule IDs as RULE_NOT_CONFIGURED (no numeric values).
 */
export function registerNfpa13_2025RuleShells(params?: {
  source_document_id?: string;
}): EditionRuleRecord[] {
  const source =
    params?.source_document_id || 'project_provided:NFPA-13-2025-cover';
  const out: EditionRuleRecord[] = [];
  for (const rule_code of NFPA13_PIPELINE_RULE_IDS) {
    const r = registerEditionRule({
      rule_code,
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: source,
      section: null,
      table_reference: null,
      verification_status: 'RULE_NOT_CONFIGURED',
      rule_status: 'rule_not_configured',
      explanation_en: `${rule_code} (${FIELD_BY_RULE[rule_code]}) — RULE_NOT_CONFIGURED until section/table verified from source.`,
      explanation_ar: `${rule_code} — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول.`,
      is_active: false,
    });
    if (r.ok) out.push(r.rule);
  }
  return out;
}

/**
 * Register a parallel edition shell without mutating the prior edition's rules.
 */
export function registerEditionRuleShellsForNewEdition(params: {
  code: string;
  edition: string;
  rule_codes: string[];
  source_document_id?: string;
}): EditionRuleRecord[] {
  const out: EditionRuleRecord[] = [];
  for (const rule_code of params.rule_codes) {
    const r = registerEditionRule({
      rule_code,
      code: params.code,
      edition: params.edition,
      source_document_id: params.source_document_id,
      verification_status: 'RULE_NOT_CONFIGURED',
      rule_status: 'rule_not_configured',
      is_active: false,
      explanation_en: `${rule_code} ${params.code} ${params.edition} — RULE_NOT_CONFIGURED pending engineer review.`,
    });
    if (r.ok) out.push(r.rule);
  }
  return out;
}

export function supersedeRule(
  ruleCode: string,
  code: string,
  oldEdition: string,
  _newEdition: string
): EditionRuleRecord | null {
  const old = getEditionRule(ruleCode, code, oldEdition);
  if (!old) return null;
  old.rule_status = 'superseded';
  old.is_active = false;
  void nowIso;
  return old;
}

export { FIELD_BY_RULE };
