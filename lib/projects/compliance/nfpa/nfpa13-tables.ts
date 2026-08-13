/**
 * NFPA 13 numeric / conditional rule table definitions.
 *
 * STRICT SOURCE RULE:
 * - Platform does NOT encode remembered/estimated NFPA table cells.
 * - `NFPA13_PLATFORM_EDITION` is null until a verified licensed edition is entered.
 * - `NFPA13_PLATFORM_THRESHOLDS` stays empty until then.
 * - PASS/FAIL is possible only when a COMPLETE project_adopted_mapping row
 *   is supplied (see REQUIRED_NFPA13_ENCODED_ROW_FIELDS + threshold).
 * - Partial mappings never resolve → RULE_NOT_CONFIGURED (never PASS).
 *
 * Authority: findings feed lib/projects/compliance only (same engine as SBC).
 * DI `di_engineering_rules` remains advisory UX cascade — not authoritative
 * NFPA PASS/FAIL (lacks structured edition/section/unit/threshold provenance).
 */

export const NFPA13_CODE = 'NFPA-13' as const;

/**
 * Platform-adopted NFPA 13 edition for numeric encoding.
 * null = edition_not_verified (see standards/catalog.ts).
 * Project may adopt 2025 via edition_adoption metadata without changing this.
 */
export const NFPA13_PLATFORM_EDITION: string | null = null;

export type Nfpa13RuleDomain =
  | 'occupancy_hazard'
  | 'sprinkler_classification'
  | 'design_area'
  | 'density'
  | 'sprinkler_spacing'
  | 'max_coverage'
  | 'remote_area'
  | 'hose_allowance'
  | 'water_demand'
  | 'hydraulic_inputs';

export type Nfpa13CompareMode =
  | 'numeric_min'
  | 'numeric_max'
  | 'numeric_eq'
  | 'categorical_in'
  | 'presence_true';

export type Nfpa13Applicability = {
  occupancy?: string | null;
  hazard?: string | null;
  sprinkler_type?: string | null;
  system_type?: string | null;
};

/**
 * Required provenance fields on every future numeric/categorical NFPA 13 row.
 * Threshold/value completeness is mode-specific (see rowHasThresholdForMode).
 */
export const REQUIRED_NFPA13_ENCODED_ROW_FIELDS = [
  'code',
  'edition',
  'section',
  'rule_id',
  'applicability',
  'parameter', // input field
  'unit',
  'source',
  'version',
  'explanation_ar',
  'explanation_en',
  'encoding_source',
] as const;

/**
 * One encoded threshold / categorical row with full provenance.
 * Platform rows must never be invented; project_adopted_mapping rows are
 * engineer-attested for that project only.
 */
export type Nfpa13EncodedRow = {
  code: typeof NFPA13_CODE;
  edition: string;
  rule_id: string;
  section: string;
  table?: string | null;
  /** Input field key on Nfpa13Context */
  parameter: string;
  unit: string | null;
  /** Exact value (eq) or presence sentinel */
  value?: number | string | boolean | null;
  minimum?: number | null;
  maximum?: number | null;
  allowed_values?: string[] | null;
  applicability: Nfpa13Applicability;
  source: string;
  /** Mapping/row version — required for PASS eligibility */
  version: string;
  explanation_ar: string;
  explanation_en: string;
  encoding_source: 'platform_code_table' | 'project_adopted_mapping';
};

export type Nfpa13RuleDefinition = {
  rule_id: string;
  domain: Nfpa13RuleDomain;
  parameter: string;
  unit: string | null;
  compare: Nfpa13CompareMode;
  /** Applicability keys that must be known before a conditional row can match */
  required_applicability: Array<keyof Nfpa13Applicability>;
  label_ar: string;
  label_en: string;
  /** Structural section hint — not a numeric claim */
  section_hint: string;
};

/** Structural rule definitions for all Phase-1 NFPA 13 domains. */
export const NFPA13_RULE_DEFINITIONS: Nfpa13RuleDefinition[] = [
  {
    rule_id: 'NFPA13-OCC-HAZARD',
    domain: 'occupancy_hazard',
    parameter: 'hazard_class',
    unit: null,
    compare: 'categorical_in',
    required_applicability: [],
    label_ar: 'تصنيف الخطورة / الإشغال',
    label_en: 'Occupancy / hazard classification',
    section_hint: 'Hazard classification (adopted edition)',
  },
  {
    rule_id: 'NFPA13-SPRINKLER-TYPE',
    domain: 'sprinkler_classification',
    parameter: 'sprinkler_type',
    unit: null,
    compare: 'categorical_in',
    required_applicability: ['hazard'],
    label_ar: 'تصنيف/نوع الرشاش',
    label_en: 'Sprinkler classification / type',
    section_hint: 'Sprinkler type selection (adopted edition)',
  },
  {
    rule_id: 'NFPA13-SYSTEM-TYPE',
    domain: 'sprinkler_classification',
    parameter: 'sprinkler_system_type',
    unit: null,
    compare: 'categorical_in',
    required_applicability: ['hazard'],
    label_ar: 'نوع نظام المرشات',
    label_en: 'Sprinkler system type',
    section_hint: 'System type (adopted edition)',
  },
  {
    rule_id: 'NFPA13-DESIGN-AREA',
    domain: 'design_area',
    parameter: 'design_area_m2',
    unit: 'm²',
    compare: 'numeric_min',
    required_applicability: ['hazard'],
    label_ar: 'مساحة التصميم',
    label_en: 'Design area',
    section_hint: 'Density/Area design area (adopted edition)',
  },
  {
    rule_id: 'NFPA13-DENSITY',
    domain: 'density',
    parameter: 'density_lpm_m2',
    unit: 'L/min·m²',
    compare: 'numeric_min',
    required_applicability: ['hazard'],
    label_ar: 'كثافة التصميم',
    label_en: 'Design density',
    section_hint: 'Density/Area tables (adopted edition)',
  },
  {
    rule_id: 'NFPA13-SPACING',
    domain: 'sprinkler_spacing',
    parameter: 'sprinkler_spacing_m',
    unit: 'm',
    compare: 'numeric_max',
    required_applicability: ['hazard', 'sprinkler_type'],
    label_ar: 'تباعد الرشاشات',
    label_en: 'Sprinkler spacing',
    section_hint: 'Maximum spacing (adopted edition)',
  },
  {
    rule_id: 'NFPA13-MAX-COVERAGE',
    domain: 'max_coverage',
    parameter: 'max_coverage_m2',
    unit: 'm²',
    compare: 'numeric_max',
    required_applicability: ['hazard', 'sprinkler_type'],
    label_ar: 'أقصى مساحة تغطية للرشاش',
    label_en: 'Maximum sprinkler coverage area',
    section_hint: 'Maximum coverage area (adopted edition)',
  },
  {
    rule_id: 'NFPA13-REMOTE-AREA',
    domain: 'remote_area',
    parameter: 'remote_area_m2',
    unit: 'm²',
    compare: 'numeric_min',
    required_applicability: ['hazard'],
    label_ar: 'المنطقة النائية',
    label_en: 'Remote area',
    section_hint: 'Remote area (adopted edition)',
  },
  {
    rule_id: 'NFPA13-HOSE-ALLOWANCE',
    domain: 'hose_allowance',
    parameter: 'hose_allowance_lpm',
    unit: 'L/min',
    compare: 'numeric_eq',
    required_applicability: ['hazard'],
    label_ar: 'بدل الخراطيم',
    label_en: 'Hose stream allowance',
    section_hint: 'Hose stream allowance tables (adopted edition)',
  },
  {
    rule_id: 'NFPA13-WATER-DEMAND',
    domain: 'water_demand',
    parameter: 'water_demand_lpm',
    unit: 'L/min',
    compare: 'numeric_min',
    required_applicability: ['hazard'],
    label_ar: 'طلب الماء',
    label_en: 'Water demand',
    section_hint: 'Water demand from density/area + hose (adopted edition)',
  },
  {
    rule_id: 'NFPA13-HYDRAULIC-INPUTS',
    domain: 'hydraulic_inputs',
    parameter: 'hydraulic_network_complete',
    unit: null,
    compare: 'presence_true',
    required_applicability: [],
    label_ar: 'مدخلات الحساب الهيدروليكي',
    label_en: 'Hydraulic calculation inputs',
    section_hint: 'Hydraulic design documentation (adopted edition)',
  },
  {
    rule_id: 'NFPA13-WATER-SUPPLY',
    domain: 'water_demand',
    parameter: 'available_water_supply',
    unit: null,
    compare: 'categorical_in',
    required_applicability: [],
    label_ar: 'مصدر المياه المتاح',
    label_en: 'Available water supply',
    section_hint: 'Water supply documentation (adopted edition)',
  },
  {
    rule_id: 'NFPA13-K-FACTOR',
    domain: 'sprinkler_classification',
    parameter: 'k_factor',
    unit: null,
    compare: 'numeric_eq',
    required_applicability: ['sprinkler_type'],
    label_ar: 'معامل K',
    label_en: 'K-factor',
    section_hint: 'K-factor for selected sprinkler (adopted edition)',
  },
];

/**
 * Platform-encoded numeric/categorical cells.
 * EMPTY — standards catalog marks NFPA-13 edition_not_verified.
 * Do not copy DI DEN-* / vision heuristics here.
 * Empty platform table MUST NOT produce PASS.
 */
export const NFPA13_PLATFORM_THRESHOLDS: Nfpa13EncodedRow[] = [];

export function getNfpa13RuleDefinition(ruleId: string): Nfpa13RuleDefinition | undefined {
  return NFPA13_RULE_DEFINITIONS.find((r) => r.rule_id === ruleId);
}

export function listNfpa13RuleIds(): string[] {
  return NFPA13_RULE_DEFINITIONS.map((r) => r.rule_id);
}

/** Threshold/value present for the rule compare mode. */
export function rowHasThresholdForMode(
  row: Nfpa13EncodedRow,
  compare: Nfpa13CompareMode
): boolean {
  if (compare === 'numeric_min') {
    const v = row.minimum ?? (typeof row.value === 'number' ? row.value : null);
    return v != null && Number.isFinite(v);
  }
  if (compare === 'numeric_max') {
    const v = row.maximum ?? (typeof row.value === 'number' ? row.value : null);
    return v != null && Number.isFinite(v);
  }
  if (compare === 'numeric_eq') {
    return (
      row.value != null &&
      row.value !== '' &&
      (typeof row.value !== 'number' || Number.isFinite(row.value))
    );
  }
  if (compare === 'categorical_in') {
    return Boolean(row.allowed_values?.length) || typeof row.value === 'string';
  }
  if (compare === 'presence_true') return true;
  return false;
}

/**
 * Provenance completeness (edition, section, source, version, explanations, …).
 * Does NOT invent defaults. Incomplete → false → cannot PASS.
 */
export function isCompleteNfpa13EncodedRow(row: Nfpa13EncodedRow | null | undefined): boolean {
  if (!row) return false;
  if (row.code !== NFPA13_CODE) return false;
  if (!String(row.edition || '').trim()) return false;
  if (!String(row.rule_id || '').trim()) return false;
  if (!String(row.section || '').trim()) return false;
  if (!String(row.parameter || '').trim()) return false;
  if (!String(row.source || '').trim()) return false;
  if (!String(row.version || '').trim()) return false;
  if (!String(row.explanation_ar || '').trim() || !String(row.explanation_en || '').trim()) {
    return false;
  }
  if (row.encoding_source !== 'platform_code_table' && row.encoding_source !== 'project_adopted_mapping') {
    return false;
  }
  if (row.applicability == null || typeof row.applicability !== 'object') return false;
  // unit may be null only for categorical/presence rules — checked with definition
  return true;
}

/**
 * Full PASS/FAIL eligibility: provenance + unit (when required) + threshold for mode.
 * Partial mappings return false → resolver yields none → RULE_NOT_CONFIGURED.
 */
export function isCompleteNfpa13MappingForRule(
  ruleId: string,
  row: Nfpa13EncodedRow | null | undefined
): boolean {
  if (!isCompleteNfpa13EncodedRow(row) || !row) return false;
  const def = getNfpa13RuleDefinition(ruleId);
  if (!def) return false;
  if (row.rule_id !== def.rule_id) return false;
  if (row.parameter !== def.parameter) return false;
  if (def.unit != null) {
    if (!String(row.unit || '').trim()) return false;
  }
  return rowHasThresholdForMode(row, def.compare);
}

function applicabilityMatches(
  row: Nfpa13EncodedRow,
  ctx: Nfpa13Applicability
): boolean {
  const a = row.applicability || {};
  if (a.occupancy) {
    if (!ctx.occupancy || norm(a.occupancy) !== norm(ctx.occupancy)) return false;
  }
  if (a.hazard) {
    if (!ctx.hazard || norm(a.hazard) !== norm(ctx.hazard)) return false;
  }
  if (a.sprinkler_type) {
    if (!ctx.sprinkler_type || norm(a.sprinkler_type) !== norm(ctx.sprinkler_type)) return false;
  }
  if (a.system_type) {
    if (!ctx.system_type || norm(a.system_type) !== norm(ctx.system_type)) return false;
  }
  return true;
}

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Resolve a conditional NFPA 13 row:
 * 1) platform thresholds matching edition + applicability (currently empty)
 * 2) project_adopted_mapping rows (same match)
 * Incomplete rows are ignored. Never invents a fallback.
 */
export function resolveNfpa13EncodedRow(params: {
  rule_id: string;
  edition: string;
  applicability: Nfpa13Applicability;
  projectRows?: Nfpa13EncodedRow[] | null;
}): { row: Nfpa13EncodedRow; reason: 'platform' | 'project' } | { row: null; reason: 'none' } {
  const edition = String(params.edition || '').trim();
  if (!edition) return { row: null, reason: 'none' };

  const match = (row: Nfpa13EncodedRow): boolean => {
    if (!isCompleteNfpa13MappingForRule(params.rule_id, row)) return false;
    if (String(row.edition).trim() !== edition) return false;
    return applicabilityMatches(row, params.applicability);
  };

  const platform = NFPA13_PLATFORM_THRESHOLDS.find(match);
  if (platform) return { row: platform, reason: 'platform' };

  const project = (params.projectRows || []).find(
    (r) => r.encoding_source === 'project_adopted_mapping' && match(r)
  );
  if (project) return { row: project, reason: 'project' };

  return { row: null, reason: 'none' };
}
