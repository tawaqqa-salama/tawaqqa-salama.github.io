/**
 * NFPA 13 rule-table infrastructure proofs.
 *
 * - Empty platform table cannot PASS
 * - Incomplete project-adopted mapping → RULE_NOT_CONFIGURED (never PASS)
 * - Complete project-adopted mapping → PASS / FAIL
 *
 * Fixture numbers are project-attested only — not platform NFPA table cells.
 */

import { describe, expect, it } from 'vitest';
import {
  buildNfpaEngineeringContext,
  evaluateNfpa13,
  evaluateNfpa13NumericRule,
  isCompleteNfpa13EncodedRow,
  isCompleteNfpa13MappingForRule,
  NFPA13_PLATFORM_EDITION,
  NFPA13_PLATFORM_THRESHOLDS,
  REQUIRED_NFPA13_ENCODED_ROW_FIELDS,
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
    id: 'c-nfpa13-infra',
    name: 'NFPA13-infra',
    business_name: 'NFPA13-infra',
    activity_type: 'مكتب',
    floors_count: 2,
    building_area: 800,
  } as ClientRecord;
}

function completeProjectRow(partial: Partial<Nfpa13EncodedRow> = {}): Nfpa13EncodedRow {
  return {
    code: 'NFPA-13',
    edition: 'PROJECT-ADOPTED-1',
    rule_id: 'NFPA13-DENSITY',
    section: 'PA-DENSITY-OH1',
    table: null,
    parameter: 'density_lpm_m2',
    unit: 'L/min·m²',
    minimum: 10,
    applicability: { hazard: 'ordinary_1' },
    source: 'project_fixture:engineer_attested_mapping',
    version: '1.0.0-test',
    explanation_ar: 'صف مشروع مكتمل — اختبار بنية الجدول.',
    explanation_en: 'Complete project row — table infrastructure test.',
    encoding_source: 'project_adopted_mapping',
    ...partial,
  };
}

function dataWith(opts: {
  density?: number;
  rows?: Nfpa13EncodedRow[];
  editionNote?: string;
}): ProjectEngineeringData {
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
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      occupancy_classification: 'Business',
    },
    compliance: {
      notes: opts.editionNote ?? 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
      nfpa13_numeric: {
        inputs: { density_lpm_m2: opts.density ?? 12 },
        adopted_rows: opts.rows ?? [completeProjectRow()],
      },
    },
  };
}

describe('NFPA 13 rule-table infrastructure', () => {
  it('documents required schema fields for every future numeric row', () => {
    expect(REQUIRED_NFPA13_ENCODED_ROW_FIELDS).toEqual(
      expect.arrayContaining([
        'code',
        'edition',
        'section',
        'rule_id',
        'applicability',
        'parameter',
        'unit',
        'source',
        'version',
        'explanation_ar',
        'explanation_en',
        'encoding_source',
      ])
    );
  });

  describe('10. empty platform rule table cannot produce PASS', () => {
    it('platform edition is null and thresholds array is empty', () => {
      expect(NFPA13_PLATFORM_EDITION).toBeNull();
      expect(NFPA13_PLATFORM_THRESHOLDS).toEqual([]);
      expect(NFPA13_PLATFORM_THRESHOLDS.length).toBe(0);
    });

    it('platform resolve always returns none', () => {
      const resolved = resolveNfpa13EncodedRow({
        rule_id: 'NFPA13-DENSITY',
        edition: 'any-edition',
        applicability: { hazard: 'ordinary_1' },
        projectRows: [],
      });
      expect(resolved.reason).toBe('none');
      expect(resolved.row).toBeNull();
    });

    it('full NFPA 13 evaluation with edition + inputs but empty platform/project → no PASS', () => {
      const { findings } = runNfpaArchitectureFindings({
        client: client(),
        data: dataWith({ rows: [], density: 12 }),
      });
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every((f) => f.status !== 'PASS')).toBe(true);
      expect(findings.some((f) => f.status === 'RULE_NOT_CONFIGURED' || f.status === 'NEEDS_DATA')).toBe(
        true
      );
    });
  });

  describe('11. incomplete project-adopted mapping → RULE_NOT_CONFIGURED', () => {
    const incompletes: Array<{ label: string; patch: Partial<Nfpa13EncodedRow> }> = [
      { label: 'missing edition', patch: { edition: '' } },
      { label: 'missing section', patch: { section: '' } },
      { label: 'missing source', patch: { source: '' } },
      { label: 'missing version', patch: { version: '' } },
      { label: 'missing explanation_ar', patch: { explanation_ar: '' } },
      { label: 'missing explanation_en', patch: { explanation_en: '' } },
      { label: 'missing unit for numeric rule', patch: { unit: null } },
      { label: 'missing threshold (no minimum/value)', patch: { minimum: null, value: null } },
    ];

    for (const { label, patch } of incompletes) {
      it(`${label}`, () => {
        const row = completeProjectRow(patch);
        expect(isCompleteNfpa13MappingForRule('NFPA13-DENSITY', row)).toBe(false);
        const ctx = buildNfpaEngineeringContext({
          client: client(),
          data: dataWith({ rows: [row], density: 12 }),
        }).nfpa13;
        const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx });
        expect(f.status).toBe('RULE_NOT_CONFIGURED');
        expect(f.status).not.toBe('PASS');
      });
    }

    it('isCompleteNfpa13EncodedRow rejects missing version', () => {
      const row = completeProjectRow({ version: '' });
      expect(isCompleteNfpa13EncodedRow(row)).toBe(false);
    });
  });

  describe('12. complete project-adopted mapping can produce PASS/FAIL', () => {
    it('PASS when actual meets minimum', () => {
      const ctx = buildNfpaEngineeringContext({
        client: client(),
        data: dataWith({ density: 12, rows: [completeProjectRow()] }),
      }).nfpa13;
      expect(isCompleteNfpa13MappingForRule('NFPA13-DENSITY', completeProjectRow())).toBe(true);
      const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx });
      expect(f.status).toBe('PASS');
      expect(f.actual_value).toBe(12);
      expect(f.required_value).toBe(10);
      expect(f.edition).toBe('PROJECT-ADOPTED-1');
    });

    it('FAIL when actual below minimum', () => {
      const ctx = buildNfpaEngineeringContext({
        client: client(),
        data: dataWith({ density: 7, rows: [completeProjectRow({ minimum: 10 })] }),
      }).nfpa13;
      const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx });
      expect(f.status).toBe('FAIL');
      expect(f.actual_value).toBe(7);
      expect(f.required_value).toBe(10);
    });

    it('evaluateNfpa13 includes PASS for density when mapping complete', () => {
      const findings = evaluateNfpa13(
        buildNfpaEngineeringContext({
          client: client(),
          data: dataWith({ density: 12 }),
        }).nfpa13
      );
      const density = findings.find((x) => x.rule_id === 'NFPA13-DENSITY');
      expect(density?.status).toBe('PASS');
    });
  });
});
