/**
 * NFPA 13 — Edition 2025 — Phase 1 numeric rule inventory.
 *
 * Project metadata (cover):
 *   code=NFPA-13, edition=2025, PROJECT_ADOPTED, PROJECT_COVER_IDENTIFIED
 *   platform_verification_status = NOT_VERIFIED_OFFICIAL (do not upgrade)
 *
 * STRICT: Encode a numeric/categorical cell ONLY when an exact section/table
 * reference has been verified from the project-provided source document.
 *
 * As of this Phase 1 scaffolding, NO section/table cells have been verified
 * from the source body (cover identity only). Therefore:
 *   NFPA13_2025_PHASE1_VERIFIED_ROWS = []
 *
 * Unverified Phase 1 rules remain RULE_NOT_CONFIGURED.
 * Missing engineering inputs remain NEEDS_DATA.
 *
 * Does not create a second rule engine — rows feed existing
 * resolveNfpa13EncodedRow / evaluateNfpa13NumericRule.
 */

import {
  NFPA13_CODE,
  type Nfpa13EncodedRow,
  type Nfpa13RuleDomain,
} from '@/lib/projects/compliance/nfpa/nfpa13-tables';
import { NFPA13_PLATFORM_EDITION, NFPA13_PLATFORM_THRESHOLDS } from '@/lib/projects/compliance/nfpa/nfpa13-tables';

export const NFPA13_2025_EDITION = '2025' as const;

export type Nfpa13_2025Phase1Domain =
  | 'hazard_classification'
  | 'sprinkler_design_criteria'
  | 'design_area'
  | 'density'
  | 'sprinkler_spacing_coverage';

export type Nfpa13_2025Phase1Slot = {
  phase: 1;
  domain: Nfpa13_2025Phase1Domain;
  rule_id: string;
  code: typeof NFPA13_CODE;
  edition: typeof NFPA13_2025_EDITION;
  /** null until verified from project-provided source */
  section: string | null;
  /** null until verified from project-provided source */
  table: string | null;
  parameter: string;
  unit: string | null;
  applicability_keys: Array<'occupancy' | 'hazard' | 'sprinkler_type' | 'system_type'>;
  /** Always RULE_NOT_CONFIGURED until a verified row is added */
  encoding_status: 'RULE_NOT_CONFIGURED' | 'VERIFIED_ENCODED';
  explanation_ar: string;
  explanation_en: string;
  source_reference: string;
};

/**
 * Phase 1 rule slots for NFPA 13-2025.
 * Section/table left null — cover identification is not section verification.
 */
export const NFPA13_2025_PHASE1_SLOTS: Nfpa13_2025Phase1Slot[] = [
  {
    phase: 1,
    domain: 'hazard_classification',
    rule_id: 'NFPA13-OCC-HAZARD',
    code: 'NFPA-13',
    edition: '2025',
    section: null,
    table: null,
    parameter: 'hazard_class',
    unit: null,
    applicability_keys: [],
    encoding_status: 'RULE_NOT_CONFIGURED',
    source_reference: 'project_provided:NFPA-13-2025-cover (section/table not yet verified)',
    explanation_ar:
      'تصنيف الخطورة — طبعة 2025 متبناة من الغلاف؛ القسم/الجدول غير مُتحقَّق → RULE_NOT_CONFIGURED.',
    explanation_en:
      'Hazard classification — 2025 adopted from cover; section/table not verified → RULE_NOT_CONFIGURED.',
  },
  {
    phase: 1,
    domain: 'sprinkler_design_criteria',
    rule_id: 'NFPA13-SPRINKLER-TYPE',
    code: 'NFPA-13',
    edition: '2025',
    section: null,
    table: null,
    parameter: 'sprinkler_type',
    unit: null,
    applicability_keys: ['hazard'],
    encoding_status: 'RULE_NOT_CONFIGURED',
    source_reference: 'project_provided:NFPA-13-2025-cover (section/table not yet verified)',
    explanation_ar:
      'معايير/نوع الرشاش — لا قيمة مرمّزة بدون قسم/جدول مُتحقَّق من المصدر.',
    explanation_en:
      'Sprinkler design criteria/type — no encoded value without verified section/table from source.',
  },
  {
    phase: 1,
    domain: 'sprinkler_design_criteria',
    rule_id: 'NFPA13-SYSTEM-TYPE',
    code: 'NFPA-13',
    edition: '2025',
    section: null,
    table: null,
    parameter: 'sprinkler_system_type',
    unit: null,
    applicability_keys: ['hazard'],
    encoding_status: 'RULE_NOT_CONFIGURED',
    source_reference: 'project_provided:NFPA-13-2025-cover (section/table not yet verified)',
    explanation_ar: 'نوع النظام — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول.',
    explanation_en: 'System type — RULE_NOT_CONFIGURED until section/table verified.',
  },
  {
    phase: 1,
    domain: 'sprinkler_design_criteria',
    rule_id: 'NFPA13-K-FACTOR',
    code: 'NFPA-13',
    edition: '2025',
    section: null,
    table: null,
    parameter: 'k_factor',
    unit: null,
    applicability_keys: ['sprinkler_type'],
    encoding_status: 'RULE_NOT_CONFIGURED',
    source_reference: 'project_provided:NFPA-13-2025-cover (section/table not yet verified)',
    explanation_ar: 'معامل K — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول.',
    explanation_en: 'K-factor — RULE_NOT_CONFIGURED until section/table verified.',
  },
  {
    phase: 1,
    domain: 'design_area',
    rule_id: 'NFPA13-DESIGN-AREA',
    code: 'NFPA-13',
    edition: '2025',
    section: null,
    table: null,
    parameter: 'design_area_m2',
    unit: 'm²',
    applicability_keys: ['hazard'],
    encoding_status: 'RULE_NOT_CONFIGURED',
    source_reference: 'project_provided:NFPA-13-2025-cover (section/table not yet verified)',
    explanation_ar: 'مساحة التصميم — لا عتبة رقمية بدون جدول مُتحقَّق.',
    explanation_en: 'Design area — no numeric threshold without verified table.',
  },
  {
    phase: 1,
    domain: 'density',
    rule_id: 'NFPA13-DENSITY',
    code: 'NFPA-13',
    edition: '2025',
    section: null,
    table: null,
    parameter: 'density_lpm_m2',
    unit: 'L/min·m²',
    applicability_keys: ['hazard'],
    encoding_status: 'RULE_NOT_CONFIGURED',
    source_reference: 'project_provided:NFPA-13-2025-cover (section/table not yet verified)',
    explanation_ar: 'الكثافة — RULE_NOT_CONFIGURED (لا اختراع قيم من الغلاف).',
    explanation_en: 'Density — RULE_NOT_CONFIGURED (no invented values from cover).',
  },
  {
    phase: 1,
    domain: 'sprinkler_spacing_coverage',
    rule_id: 'NFPA13-SPACING',
    code: 'NFPA-13',
    edition: '2025',
    section: null,
    table: null,
    parameter: 'sprinkler_spacing_m',
    unit: 'm',
    applicability_keys: ['hazard', 'sprinkler_type'],
    encoding_status: 'RULE_NOT_CONFIGURED',
    source_reference: 'project_provided:NFPA-13-2025-cover (section/table not yet verified)',
    explanation_ar: 'التباعد — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول.',
    explanation_en: 'Spacing — RULE_NOT_CONFIGURED until section/table verified.',
  },
  {
    phase: 1,
    domain: 'sprinkler_spacing_coverage',
    rule_id: 'NFPA13-MAX-COVERAGE',
    code: 'NFPA-13',
    edition: '2025',
    section: null,
    table: null,
    parameter: 'max_coverage_m2',
    unit: 'm²',
    applicability_keys: ['hazard', 'sprinkler_type'],
    encoding_status: 'RULE_NOT_CONFIGURED',
    source_reference: 'project_provided:NFPA-13-2025-cover (section/table not yet verified)',
    explanation_ar: 'أقصى تغطية — RULE_NOT_CONFIGURED حتى التحقق من القسم/الجدول.',
    explanation_en: 'Max coverage — RULE_NOT_CONFIGURED until section/table verified.',
  },
];

/**
 * Verified encoded rows for NFPA 13-2025 Phase 1.
 * EMPTY — no exact section/table cells verified from the project source body yet.
 * Do not invent densities, areas, spacing, or coverage values.
 * Do not upgrade platform_verification_status when adding future rows here
 * unless maintainers explicitly set VERIFIED_OFFICIAL after full review.
 */
export const NFPA13_2025_PHASE1_VERIFIED_ROWS: Nfpa13EncodedRow[] = [];

export function listNfpa13_2025Phase1EncodedSections(): Array<{
  rule_id: string;
  section: string;
  table: string | null;
}> {
  return NFPA13_2025_PHASE1_VERIFIED_ROWS.map((r) => ({
    rule_id: r.rule_id,
    section: r.section,
    table: r.table ?? null,
  }));
}

export function listNfpa13_2025Phase1PendingSlots(): Nfpa13_2025Phase1Slot[] {
  return NFPA13_2025_PHASE1_SLOTS.filter((s) => s.encoding_status === 'RULE_NOT_CONFIGURED');
}

export function assertNfpa13PlatformNotUpgraded(): void {
  if (NFPA13_PLATFORM_EDITION != null) {
    throw new Error('NFPA13_PLATFORM_EDITION must remain null (NOT_VERIFIED_OFFICIAL)');
  }
  if (NFPA13_PLATFORM_THRESHOLDS.length > 0) {
    throw new Error('NFPA13_PLATFORM_THRESHOLDS must remain empty until VERIFIED_OFFICIAL encoding');
  }
}

export function phase1DomainToRuleDomains(domain: Nfpa13_2025Phase1Domain): Nfpa13RuleDomain[] {
  switch (domain) {
    case 'hazard_classification':
      return ['occupancy_hazard'];
    case 'sprinkler_design_criteria':
      return ['sprinkler_classification'];
    case 'design_area':
      return ['design_area'];
    case 'density':
      return ['density'];
    case 'sprinkler_spacing_coverage':
      return ['sprinkler_spacing', 'max_coverage'];
    default:
      return [];
  }
}
