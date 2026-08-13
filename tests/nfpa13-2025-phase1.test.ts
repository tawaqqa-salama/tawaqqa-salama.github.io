/**
 * NFPA 13-2025 Phase 1 numeric rules — encoding status tests.
 *
 * Cover adoption ≠ verified section/table. Platform stays NOT_VERIFIED_OFFICIAL.
 * No invented numeric cells. Incomplete mapping never PASS.
 */

import { describe, expect, it } from 'vitest';
import {
  assertNfpa13PlatformNotUpgraded,
  buildNfpa13_2025ProjectAdoption,
  buildNfpaEngineeringContext,
  evaluateNfpa13NumericRule,
  isCompleteNfpa13MappingForRule,
  listNfpa13_2025Phase1EncodedSections,
  listNfpa13_2025Phase1PendingSlots,
  NFPA13_2025_EDITION,
  NFPA13_2025_PHASE1_SLOTS,
  NFPA13_2025_PHASE1_VERIFIED_ROWS,
  NFPA13_PLATFORM_EDITION,
  NFPA13_PLATFORM_THRESHOLDS,
  resolveNfpa13EncodedRow,
  runNfpaArchitectureFindings,
} from '@/lib/projects/compliance';
import type { Nfpa13EncodedRow } from '@/lib/projects/compliance/nfpa/nfpa13-tables';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';

function client(): ClientRecord {
  return {
    id: 'c-nfpa13-p1',
    name: 'NFPA13-P1',
    business_name: 'NFPA13-P1',
    activity_type: 'مكتب',
    floors_count: 2,
    building_area: 800,
  } as ClientRecord;
}

function adoptionData(partial: {
  density?: number | null;
  rows?: Nfpa13EncodedRow[];
  editionOverride?: string;
} = {}): ProjectEngineeringData {
  const adoption = buildNfpa13_2025ProjectAdoption({
    source_document_id: 'project_provided:NFPA-13-2025-cover',
  });
  if (partial.editionOverride) {
    adoption.edition = partial.editionOverride;
  }
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    fire_protection_design: {
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, hazard_class: 'ordinary_1' },
      sprinkler: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
        required: 'yes',
        sprinkler_type: 'pendent',
        system_type: 'wet',
      },
    },
    compliance: {
      nfpa13_numeric: {
        edition_adoption: adoption,
        inputs:
          partial.density === null
            ? {}
            : { density_lpm_m2: partial.density ?? 12 },
        adopted_rows: partial.rows ?? [],
      },
    },
  };
}

/**
 * Test-only complete project mapping — proves evaluator PASS/FAIL when a
 * verified section/table IS supplied. Not a platform-encoded NFPA table cell.
 * Numbers are project-fixture thresholds, not claimed code text.
 */
function verifiedProjectDensityRow(partial: Partial<Nfpa13EncodedRow> = {}): Nfpa13EncodedRow {
  return {
    code: 'NFPA-13',
    edition: '2025',
    rule_id: 'NFPA13-DENSITY',
    section: 'PROJECT-VERIFIED-TEST-SECTION',
    table: 'PROJECT-VERIFIED-TEST-TABLE',
    parameter: 'density_lpm_m2',
    unit: 'L/min·m²',
    minimum: 10,
    applicability: { hazard: 'ordinary_1' },
    source: 'project_fixture:verified_section_for_evaluator_test',
    version: 'phase1-test-1.0',
    explanation_ar: 'صف اختبار مكتمل بعد تحقق قسم/جدول (ليس ترميز منصة).',
    explanation_en: 'Complete test row after section/table verification (not platform encoding).',
    encoding_source: 'project_adopted_mapping',
    ...partial,
  };
}

describe('NFPA 13-2025 Phase 1 numeric rules', () => {
  it('does not upgrade platform verification; verified rows list is empty', () => {
    expect(NFPA13_2025_EDITION).toBe('2025');
    expect(NFPA13_PLATFORM_EDITION).toBeNull();
    expect(NFPA13_PLATFORM_THRESHOLDS).toEqual([]);
    expect(NFPA13_2025_PHASE1_VERIFIED_ROWS).toEqual([]);
    expect(listNfpa13_2025Phase1EncodedSections()).toEqual([]);
    expect(() => assertNfpa13PlatformNotUpgraded()).not.toThrow();
  });

  it('Phase 1 slots cover hazard / sprinkler criteria / design area / density / spacing-coverage', () => {
    const domains = new Set(NFPA13_2025_PHASE1_SLOTS.map((s) => s.domain));
    expect(domains).toEqual(
      new Set([
        'hazard_classification',
        'sprinkler_design_criteria',
        'design_area',
        'density',
        'sprinkler_spacing_coverage',
      ])
    );
    expect(listNfpa13_2025Phase1PendingSlots().every((s) => s.section === null && s.table === null)).toBe(
      true
    );
    expect(listNfpa13_2025Phase1PendingSlots().every((s) => s.encoding_status === 'RULE_NOT_CONFIGURED')).toBe(
      true
    );
  });

  it('cover adoption + inputs without verified section → RULE_NOT_CONFIGURED (never PASS)', () => {
    const { findings } = runNfpaArchitectureFindings({
      client: client(),
      data: adoptionData({ density: 12, rows: [] }),
    });
    const phase1Ids = new Set(NFPA13_2025_PHASE1_SLOTS.map((s) => s.rule_id));
    const phase1 = findings.filter((f) => phase1Ids.has(f.rule_id));
    expect(phase1.length).toBeGreaterThan(0);
    expect(phase1.every((f) => f.status !== 'PASS')).toBe(true);
    const density = phase1.find((f) => f.rule_id === 'NFPA13-DENSITY');
    expect(density?.status).toBe('RULE_NOT_CONFIGURED');
    expect(density?.edition).toBe('2025');
  });

  it('verified rule (complete project mapping with section/table) → PASS', () => {
    const row = verifiedProjectDensityRow();
    expect(isCompleteNfpa13MappingForRule('NFPA13-DENSITY', row)).toBe(true);
    const ctx = buildNfpaEngineeringContext({
      client: client(),
      data: adoptionData({ density: 12, rows: [row] }),
    }).nfpa13;
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx });
    expect(f.status).toBe('PASS');
    expect(f.edition).toBe('2025');
    expect(f.required_value).toBe(10);
  });

  it('verified rule → FAIL when actual below threshold', () => {
    const ctx = buildNfpaEngineeringContext({
      client: client(),
      data: adoptionData({ density: 7, rows: [verifiedProjectDensityRow()] }),
    }).nfpa13;
    expect(evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx }).status).toBe('FAIL');
  });

  it('missing input → NEEDS_DATA', () => {
    const ctx = buildNfpaEngineeringContext({
      client: client(),
      data: adoptionData({ density: null, rows: [verifiedProjectDensityRow()] }),
    }).nfpa13;
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx });
    expect(f.status).toBe('NEEDS_DATA');
    expect(f.input_state).toBe('MISSING');
  });

  it('incomplete mapping → RULE_NOT_CONFIGURED (never PASS)', () => {
    const incomplete = verifiedProjectDensityRow({ section: '', version: '' });
    expect(isCompleteNfpa13MappingForRule('NFPA13-DENSITY', incomplete)).toBe(false);
    const ctx = buildNfpaEngineeringContext({
      client: client(),
      data: adoptionData({ density: 12, rows: [incomplete] }),
    }).nfpa13;
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx });
    expect(f.status).toBe('RULE_NOT_CONFIGURED');
    expect(f.status).not.toBe('PASS');
  });

  it('wrong edition → RULE_NOT_CONFIGURED', () => {
    const row = verifiedProjectDensityRow({ edition: '2019' });
    const resolved = resolveNfpa13EncodedRow({
      rule_id: 'NFPA13-DENSITY',
      edition: '2025',
      applicability: { hazard: 'ordinary_1' },
      projectRows: [row],
    });
    expect(resolved.reason).toBe('none');
    const ctx = buildNfpaEngineeringContext({
      client: client(),
      data: adoptionData({ density: 12, rows: [row] }),
    }).nfpa13;
    expect(ctx.nfpa13_edition.value).toBe('2025');
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx });
    expect(f.status).toBe('RULE_NOT_CONFIGURED');
    expect(f.explanation_en).toMatch(/edition mismatch|different edition|no encoded row/i);
  });

  it('RULE_NOT_CONFIGURED cannot become PASS without complete verified mapping', () => {
    const statuses = NFPA13_2025_PHASE1_SLOTS.map((slot) => {
      const ctx = buildNfpaEngineeringContext({
        client: client(),
        data: adoptionData({ density: 12, rows: [] }),
      }).nfpa13;
      return evaluateNfpa13NumericRule({ rule_id: slot.rule_id, ctx }).status;
    });
    expect(statuses.every((s) => s !== 'PASS')).toBe(true);
    expect(statuses.some((s) => s === 'RULE_NOT_CONFIGURED' || s === 'NEEDS_DATA')).toBe(true);
  });
});
