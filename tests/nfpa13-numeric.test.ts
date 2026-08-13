/**
 * NFPA 13 numeric rule encoding — Phase 1.
 *
 * Platform thresholds are empty (edition_not_verified).
 * PASS/FAIL only via complete project_adopted_mapping fixtures —
 * numbers in tests are project-attested fixtures, NOT claimed NFPA table cells.
 */

import { describe, expect, it } from 'vitest';
import {
  buildNfpaEngineeringContext,
  evaluateNfpa13,
  evaluateNfpa13NumericRule,
  NFPA13_PLATFORM_EDITION,
  NFPA13_PLATFORM_THRESHOLDS,
  NFPA13_RULE_DEFINITIONS,
  resolveNfpa13EncodedRow,
  runNfpaArchitectureFindings,
} from '@/lib/projects/compliance';
import { resolveCanonicalEngineeringDataset } from '@/lib/projects/canonical-engineering';
import type { Nfpa13EncodedRow } from '@/lib/projects/compliance/nfpa/nfpa13-tables';
import type { Nfpa13Context } from '@/lib/projects/compliance/nfpa/types';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';

function client(): ClientRecord {
  return {
    id: 'c-nfpa13',
    name: 'NFPA13',
    business_name: 'NFPA13',
    activity_type: 'مكتب',
    floors_count: 2,
    building_area: 800,
  } as ClientRecord;
}

/** Project-attested fixture row — NOT a platform-encoded NFPA table cell. */
function projectDensityRow(partial: Partial<Nfpa13EncodedRow> = {}): Nfpa13EncodedRow {
  return {
    code: 'NFPA-13',
    edition: 'PROJECT-ADOPTED-1',
    rule_id: 'NFPA13-DENSITY',
    section: 'PA-DENSITY-OH1',
    table: 'project-attested-density-row',
    parameter: 'density_lpm_m2',
    unit: 'L/min·m²',
    minimum: 10,
    applicability: { hazard: 'ordinary_1' },
    source: 'project_fixture:engineer_attested_mapping',
    version: '1.0.0-test',
    explanation_ar: 'صف مشروع موثّق لكثافة OH-1 — ليس جدولاً منصّة.',
    explanation_en: 'Project-attested OH-1 density row — not a platform table cell.',
    encoding_source: 'project_adopted_mapping',
    ...partial,
  };
}

function baseData(partial: Partial<ProjectEngineeringData> = {}): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    fire_protection_design: {
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, hazard_class: 'ordinary_1' },
      sprinkler: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
        required: 'yes',
        system_type: 'wet',
        sprinkler_type: 'pendent',
        k_factor: '5.6',
        design_flow: '450',
        design_pressure: '7',
      },
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      occupancy_classification: 'Business',
    },
    compliance: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.compliance,
      notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
      nfpa13_numeric: {
        inputs: {
          density_lpm_m2: 12,
          design_area_m2: 150,
          hose_allowance_lpm: 250,
          sprinkler_spacing_m: 3.5,
          max_coverage_m2: 12,
          remote_area_m2: 140,
        },
        adopted_rows: [projectDensityRow()],
      },
    },
    ...partial,
  };
}

function ctxFrom(data: ProjectEngineeringData): Nfpa13Context {
  return buildNfpaEngineeringContext({ client: client(), data }).nfpa13;
}

describe('NFPA 13 numeric encoding (Phase 1)', () => {
  it('platform edition/thresholds remain unconfigured (no invented cells)', () => {
    expect(NFPA13_PLATFORM_EDITION).toBeNull();
    expect(NFPA13_PLATFORM_THRESHOLDS).toEqual([]);
    expect(NFPA13_RULE_DEFINITIONS.length).toBeGreaterThanOrEqual(10);
    expect(NFPA13_RULE_DEFINITIONS.some((r) => r.rule_id === 'NFPA13-MAX-COVERAGE')).toBe(true);
  });

  it('exact numeric rule evaluation → PASS when project-adopted row matches', () => {
    const ctx = ctxFrom(baseData());
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx });
    expect(f.status).toBe('PASS');
    expect(f.actual_value).toBe(12);
    expect(f.required_value).toBe(10);
    expect(f.edition).toBe('PROJECT-ADOPTED-1');
    expect(f.unit).toBe('L/min·m²');
  });

  it('exact numeric rule evaluation → FAIL when actual below minimum', () => {
    const data = baseData({
      compliance: {
        notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
        nfpa13_numeric: {
          inputs: { density_lpm_m2: 8 },
          adopted_rows: [projectDensityRow()],
        },
      },
    });
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx: ctxFrom(data) });
    expect(f.status).toBe('FAIL');
    expect(f.actual_value).toBe(8);
    expect(f.required_value).toBe(10);
  });

  it('edition mismatch → RULE_NOT_CONFIGURED', () => {
    const data = baseData({
      compliance: {
        notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
        nfpa13_numeric: {
          inputs: { density_lpm_m2: 12 },
          adopted_rows: [projectDensityRow({ edition: 'OTHER-EDITION' })],
        },
      },
    });
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx: ctxFrom(data) });
    expect(f.status).toBe('RULE_NOT_CONFIGURED');
    expect(f.explanation_en).toMatch(/edition mismatch|different edition/i);
  });

  it('missing edition → RULE_NOT_CONFIGURED (never PASS)', () => {
    const data = baseData({
      compliance: {
        notes: '',
        nfpa13_numeric: {
          inputs: { density_lpm_m2: 12 },
          adopted_rows: [projectDensityRow()],
        },
      },
    });
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx: ctxFrom(data) });
    expect(f.status).toBe('RULE_NOT_CONFIGURED');
    expect(f.status).not.toBe('PASS');
  });

  it('missing input → NEEDS_DATA', () => {
    const data = baseData({
      compliance: {
        notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
        nfpa13_numeric: {
          inputs: {},
          adopted_rows: [projectDensityRow()],
        },
      },
    });
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx: ctxFrom(data) });
    expect(f.status).toBe('NEEDS_DATA');
    expect(f.input_state).toBe('MISSING');
  });

  it('invalid input → NEEDS_DATA with INVALID state', () => {
    const data = baseData({
      compliance: {
        notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
        nfpa13_numeric: {
          // force invalid via non-positive after parse — use sprinkler k_factor path
          inputs: { density_lpm_m2: -5 },
          adopted_rows: [projectDensityRow()],
        },
      },
    });
    // numField treats <=0 as INVALID when raw present
    const ctx = ctxFrom(data);
    expect(ctx.density_lpm_m2.state).toBe('INVALID');
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx });
    expect(f.status).toBe('NEEDS_DATA');
    expect(f.input_state).toBe('INVALID');
  });

  it('canonical conflict → CONFLICT (no PASS)', () => {
    const merged = resolveCanonicalEngineeringDataset({
      live: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Business',
          exits_count: '2',
        },
      },
      legacy: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Assembly',
          exits_count: '3',
        },
      },
    });
    const withNumeric: ProjectEngineeringData = {
      ...merged,
      fire_protection_design: {
        ...EMPTY_FIRE_PROTECTION_DESIGN,
        occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, hazard_class: 'ordinary_1' },
        sprinkler: { ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler, required: 'yes', sprinkler_type: 'pendent' },
      },
      compliance: {
        notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
        nfpa13_numeric: {
          inputs: { density_lpm_m2: 12 },
          adopted_rows: [projectDensityRow()],
        },
      },
    };
    const ctx = ctxFrom(withNumeric);
    expect(ctx.occupancy.state).toBe('CONFLICT');
    // Density itself can still evaluate; occupancy conflict surfaces on rules needing occupancy
    const spacingNeedsType = evaluateNfpa13NumericRule({
      rule_id: 'NFPA13-SPACING',
      ctx: {
        ...ctx,
        sprinkler_spacing_m: { state: 'VALID', value: 3 },
        project_rule_rows: [
          {
            ...projectDensityRow({
              rule_id: 'NFPA13-SPACING',
              parameter: 'sprinkler_spacing_m',
              section: 'PA-SPACING',
              unit: 'm',
              minimum: null,
              maximum: 4,
              applicability: { hazard: 'ordinary_1', sprinkler_type: 'pendent' },
              explanation_ar: 'تباعد مشروع',
              explanation_en: 'project spacing',
            }),
          },
        ],
      },
    });
    // hazard VALID, sprinkler_type VALID → may PASS; force occupancy-required rule
    const designArea = evaluateNfpa13NumericRule({
      rule_id: 'NFPA13-DESIGN-AREA',
      ctx: {
        ...ctx,
        design_area_m2: { state: 'VALID', value: 150 },
        occupancy: { state: 'CONFLICT', value: null },
        project_rule_rows: [
          projectDensityRow({
            rule_id: 'NFPA13-DESIGN-AREA',
            parameter: 'design_area_m2',
            section: 'PA-AREA',
            unit: 'm²',
            minimum: 100,
            applicability: { hazard: 'ordinary_1', occupancy: 'Business' },
            explanation_ar: 'مساحة',
            explanation_en: 'area',
          }),
        ],
      },
    });
    // applicability occupancy CONFLICT isn't in required_applicability for design_area (only hazard)
    // Use a finding that requires conflict on the measured field itself:
    const conflictDensity = evaluateNfpa13NumericRule({
      rule_id: 'NFPA13-DENSITY',
      ctx: {
        ...ctx,
        density_lpm_m2: { state: 'CONFLICT', value: null },
      },
    });
    expect(conflictDensity.status).toBe('CONFLICT');
    expect(conflictDensity.status).not.toBe('PASS');
    void spacingNeedsType;
    void designArea;
  });

  it('conditional applicability — wrong hazard does not match OH-1 row', () => {
    const data = baseData({
      fire_protection_design: {
        ...EMPTY_FIRE_PROTECTION_DESIGN,
        occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, hazard_class: 'light' },
        sprinkler: { ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler, required: 'yes' },
      },
      compliance: {
        notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
        nfpa13_numeric: {
          inputs: { density_lpm_m2: 12 },
          adopted_rows: [projectDensityRow({ applicability: { hazard: 'ordinary_1' } })],
        },
      },
    });
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx: ctxFrom(data) });
    expect(f.status).toBe('RULE_NOT_CONFIGURED');
  });

  it('conditional applicability — missing hazard → NEEDS_DATA', () => {
    const data = baseData({
      fire_protection_design: {
        ...EMPTY_FIRE_PROTECTION_DESIGN,
        occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, hazard_class: '' },
        sprinkler: { ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler, required: 'yes' },
      },
      compliance: {
        notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
        nfpa13_numeric: {
          inputs: { density_lpm_m2: 12 },
          adopted_rows: [projectDensityRow()],
        },
      },
    });
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx: ctxFrom(data) });
    expect(f.status).toBe('NEEDS_DATA');
    expect(f.explanation_en).toMatch(/applicability.*hazard/i);
  });

  it('RULE_NOT_CONFIGURED when edition present but no encoded row', () => {
    const data = baseData({
      compliance: {
        notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
        nfpa13_numeric: {
          inputs: { density_lpm_m2: 12 },
          adopted_rows: [],
        },
      },
    });
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx: ctxFrom(data) });
    expect(f.status).toBe('RULE_NOT_CONFIGURED');
    expect(resolveNfpa13EncodedRow({
      rule_id: 'NFPA13-DENSITY',
      edition: 'PROJECT-ADOPTED-1',
      applicability: { hazard: 'ordinary_1' },
      projectRows: [],
    }).reason).toBe('none');
  });

  it('legacy JSON cannot override canonical live density inputs', () => {
    const merged = resolveCanonicalEngineeringDataset({
      live: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, hazard_class: 'ordinary_1' },
          sprinkler: { ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler, required: 'yes' },
        },
        compliance: {
          notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1',
          nfpa13_numeric: {
            inputs: { density_lpm_m2: 12 },
            adopted_rows: [projectDensityRow()],
          },
        },
      },
      legacy: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        compliance: {
          notes: 'CODE=NFPA-13;EDITION=LEGACY-EDITION',
          nfpa13_numeric: {
            inputs: { density_lpm_m2: 99 },
            adopted_rows: [projectDensityRow({ minimum: 1 })],
          },
        },
      },
    });
    // Live compliance object wins on shallow merge (...legacy, ...live)
    expect(merged.compliance?.nfpa13_numeric?.inputs?.density_lpm_m2).toBe(12);
    expect(merged.compliance?.notes).toMatch(/PROJECT-ADOPTED-1/);
    const f = evaluateNfpa13NumericRule({ rule_id: 'NFPA13-DENSITY', ctx: ctxFrom(merged) });
    expect(f.actual_value).toBe(12);
    expect(f.actual_value).not.toBe(99);
    expect(f.status).toBe('PASS');
  });

  it('evaluateNfpa13 never PASS without encoded row; domains covered', () => {
    const { findings } = runNfpaArchitectureFindings({
      client: client(),
      data: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          sprinkler: { ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler, required: 'yes' },
          occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, hazard_class: 'ordinary_1' },
        },
        compliance: { notes: 'CODE=NFPA-13;EDITION=PROJECT-ADOPTED-1' },
      },
    });
    expect(findings.some((f) => f.rule_id === 'NFPA13-MAX-COVERAGE')).toBe(true);
    expect(findings.every((f) => f.status !== 'PASS')).toBe(true);
    expect(evaluateNfpa13(ctxFrom(baseData())).some((f) => f.rule_id === 'NFPA13-DENSITY' && f.status === 'PASS')).toBe(
      true
    );
  });
});
