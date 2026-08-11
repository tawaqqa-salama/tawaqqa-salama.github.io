import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_RULES,
  getComplianceRuleById,
  isFullyCompliant,
  requiredExitsFromOccupantLoad,
  runProjectCompliance,
  type ComplianceRuleContext,
} from '@/lib/projects/compliance';
import { evaluateRule, runComplianceRules } from '@/lib/projects/compliance/engine';
import { stageApprovalBlockers } from '@/lib/projects/gated-pipeline';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';

function baseClient(partial: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 'c1',
    name: 'Test Client',
    business_name: 'منشأة اختبار',
    activity_type: 'مكاتب',
    floors_count: 3,
    building_area: 2000,
    land_area: 2500,
    ...partial,
  } as ClientRecord;
}

function emptyCtx(partial: Partial<ComplianceRuleContext> = {}): ComplianceRuleContext {
  return {
    evaluatedAt: new Date().toISOString(),
    client: { activity_type: 'مكاتب', floors_count: 3, building_area: 2000 },
    building: {
      occupancy_classification: null,
      building_type_code: null,
      group_letter: null,
      construction_type: null,
      building_area_m2: null,
      building_height_m: null,
      stories: null,
      basement_floors: null,
      high_rise: null,
      mixed_occupancy: null,
      underground: null,
      windowless: null,
      atrium: null,
      special_conditions: [],
    },
    occupancyZones: [],
    egress: {
      metrics: [],
    },
    fireAccess: {},
    fireProtection: {
      applicable_codes: ['SBC 201', 'SBC 801'],
    },
    hydraulic: { has_network_data: false },
    fireAlarm: {},
    smokeControl: {},
    overrides: [],
    ...partial,
  };
}

describe('Saudi Code Compliance Engine', () => {
  it('registers core rule domains', () => {
    const ids = COMPLIANCE_RULES.map((r) => r.id);
    expect(ids.some((id) => id.startsWith('OCC-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('EGR-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('FAC-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('FP-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('HYD-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('FA-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('SMK-'))).toBe(true);
  });

  it('required exits are based on occupant load bands — not exits=occupants', () => {
    expect(requiredExitsFromOccupantLoad(40)).toBe(1);
    expect(requiredExitsFromOccupantLoad(50)).toBe(2);
    expect(requiredExitsFromOccupantLoad(500)).toBe(2);
    expect(requiredExitsFromOccupantLoad(501)).toBe(3);
    expect(requiredExitsFromOccupantLoad(1000)).toBe(3);
    expect(requiredExitsFromOccupantLoad(1500)).toBe(4);
  });

  it('OCC-01 NEEDS_DATA when occupancy missing — never PASS by assumption', () => {
    const rule = getComplianceRuleById('OCC-01')!;
    const result = evaluateRule(rule, emptyCtx());
    expect(result.status).toBe('NEEDS_DATA');
  });

  it('OCC-01 PASS when occupancy classification present', () => {
    const rule = getComplianceRuleById('OCC-01')!;
    const result = evaluateRule(
      rule,
      emptyCtx({
        building: {
          ...emptyCtx().building,
          occupancy_classification: 'GROUP B — مكاتب',
        },
      })
    );
    expect(result.status).toBe('PASS');
  });

  it('EGR-02 fails when exits < required from occupant load', () => {
    const rule = getComplianceRuleById('EGR-02')!;
    const result = evaluateRule(
      rule,
      emptyCtx({
        egress: {
          metrics: [],
          occupant_load_total: 120,
          exits_count: 1,
        },
      })
    );
    expect(result.status).toBe('FAIL');
    expect(result.message).not.toMatch(/شاغلين\s*=\s*مخارج/);
  });

  it('EGR-02 PASS when exits meet load-based requirement', () => {
    const rule = getComplianceRuleById('EGR-02')!;
    const result = evaluateRule(
      rule,
      emptyCtx({
        egress: {
          metrics: [],
          occupant_load_total: 120,
          exits_count: 2,
        },
      })
    );
    expect(result.status).toBe('PASS');
  });

  it('EGR-06 NEEDS_DATA when travel distance missing', () => {
    const rule = getComplianceRuleById('EGR-06')!;
    expect(evaluateRule(rule, emptyCtx()).status).toBe('NEEDS_DATA');
  });

  it('FAC-02 NEEDS_DATA when access width missing (no silent PASS)', () => {
    const rule = getComplianceRuleById('FAC-02')!;
    expect(evaluateRule(rule, emptyCtx()).status).toBe('NEEDS_DATA');
  });

  it('FP-04 does not treat pump flow as sprinkler demand', () => {
    const rule = getComplianceRuleById('FP-04')!;
    const result = evaluateRule(
      rule,
      emptyCtx({
        fireProtection: {
          applicable_codes: [],
          sprinkler_required: 'yes',
          pump_flow_lpm: 2500,
          sprinkler_demand_lpm: null,
        },
      })
    );
    expect(result.status).toBe('NEEDS_DATA');
    expect(result.message).toMatch(/Pump Flow|طلب المرشات|Demand/i);
  });

  it('FP-07 FAIL when pump flow < documented sprinkler demand', () => {
    const rule = getComplianceRuleById('FP-07')!;
    const result = evaluateRule(
      rule,
      emptyCtx({
        fireProtection: {
          applicable_codes: [],
          sprinkler_required: 'yes',
          pump_exists: 'yes',
          pump_flow_lpm: 500,
          sprinkler_demand_lpm: 1200,
        },
      })
    );
    expect(result.status).toBe('FAIL');
  });

  it('HYD-01 NEEDS_DATA when pipe network fields missing', () => {
    const rule = getComplianceRuleById('HYD-01')!;
    const result = evaluateRule(
      rule,
      emptyCtx({
        fireProtection: {
          applicable_codes: [],
          sprinkler_provided: 'yes',
        },
        hydraulic: { has_network_data: false },
      })
    );
    expect(result.status).toBe('NEEDS_DATA');
  });

  it('SMK-01 does not PASS on ventilation-only when smoke required', () => {
    const rule = getComplianceRuleById('SMK-01')!;
    const result = evaluateRule(
      rule,
      emptyCtx({
        smokeControl: {
          required: true,
          status: 'unknown',
          ventilation_only: true,
        },
      })
    );
    expect(['FAIL', 'NEEDS_DATA']).toContain(result.status);
    expect(result.status).not.toBe('PASS');
  });

  it('empty project run is BLOCKED and not fully compliant', () => {
    const run = runProjectCompliance({
      client: baseClient(),
      data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
    });
    expect(run.gate).toBe('BLOCKED');
    expect(isFullyCompliant(run)).toBe(false);
    expect(run.mandatoryNeedsData + run.mandatoryFail).toBeGreaterThan(0);
    expect(run.matrix.length).toBe(COMPLIANCE_RULES.length);
  });

  it('engineer override requires reason + code reference', () => {
    const ctx = emptyCtx({
      building: {
        ...emptyCtx().building,
        occupancy_classification: null,
      },
      overrides: [
        {
          ruleId: 'OCC-01',
          reason: 'short',
          codeReference: 'SBC 201 §3',
          overriddenAt: new Date().toISOString(),
          resultingStatus: 'PASS',
        },
      ],
    });
    const run = runComplianceRules(ctx, [getComplianceRuleById('OCC-01')!]);
    expect(run.results[0].effectiveStatus).toBe('NEEDS_DATA');

    const ok = runComplianceRules(
      {
        ...ctx,
        overrides: [
          {
            ruleId: 'OCC-01',
            reason: 'تصنيف موثّق في رخصة البناء المرفقة',
            codeReference: 'SBC 201 §302',
            overriddenAt: new Date().toISOString(),
            resultingStatus: 'PASS',
          },
        ],
      },
      [getComplianceRuleById('OCC-01')!]
    );
    expect(ok.results[0].effectiveStatus).toBe('PASS');
  });

  it('workflow gates block technical_report / transmittals / final_report / completion when compliance BLOCKED', () => {
    const client = baseClient();
    const data = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      fire_protection_design: { ...EMPTY_FIRE_PROTECTION_DESIGN },
    };
    for (const stage of ['technical_report', 'transmittals', 'final_report', 'completion'] as const) {
      const blockers = stageApprovalBlockers(stage, client, data);
      expect(blockers.some((b) => /المطابقة|BLOCKED|NEEDS_DATA|FAIL/i.test(b))).toBe(true);
    }
  });

  it('designs stage is not blocked solely by compliance engine', () => {
    const client = baseClient();
    const data = { ...EMPTY_PROJECT_ENGINEERING_DATA };
    const blockers = stageApprovalBlockers('designs', client, data);
    expect(blockers.every((b) => !/بوابة المطابقة الكودية/.test(b))).toBe(true);
  });
});
