/**
 * NFPA Engineering Architecture — architecture-first tests.
 * No invented numeric PASS. Advisory / vision / DI cannot create PASS.
 */

import { describe, expect, it } from 'vitest';
import {
  CANONICAL_ENGINEERING_STORE,
  resolveCanonicalEngineeringDataset,
} from '@/lib/projects/canonical-engineering';
import {
  buildComplianceContext,
  buildNfpaEngineeringContext,
  COMPLIANCE_GATED_STAGES,
  COMPLIANCE_RULES,
  evaluateNfpa13,
  gateBlockerMessages,
  getComplianceRuleById,
  isNfpaAdvisorySource,
  NFPA_ADVISORY_SOURCES,
  NFPA_AUTHORITY,
  NFPA_RULE_DEFS,
  rejectAdvisoryPassAttempt,
  runNfpaArchitectureFindings,
  runProjectCompliance,
  summarizeResults,
} from '@/lib/projects/compliance';
import { evaluateRule } from '@/lib/projects/compliance/engine';
import type { ComplianceRuleResult } from '@/lib/projects/compliance/types';
import { validateCompliance } from '@/lib/compliance/engine';
import { runProjectKnowledgeCompliance } from '@/lib/design-intelligence/project-knowledge-bridge';
import { isAuthoritativeCalcResult } from '@/lib/projects/design-center/types';
import { runKnowledgeBackedCalculation } from '@/lib/projects/design-center/knowledge-engine';
import { approveWorkflowStage } from '@/lib/projects/gated-pipeline';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';

function baseClient(partial: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 'client-nfpa',
    name: 'عميل NFPA',
    business_name: 'منشأة NFPA',
    activity_type: 'مكتب إداري',
    floors_count: 3,
    building_area: 1200,
    ...partial,
  } as ClientRecord;
}

function mv<U extends string>(value: number, unit: U) {
  return { value, unit, source: 'engineer_input' as const };
}

function dataWithFp(partial: Partial<ProjectEngineeringData> = {}): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    fire_protection_design: {
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      occupancy: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy,
        hazard_class: 'ordinary_1',
      },
      sprinkler: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
        required: 'yes',
        system_type: 'wet',
        sprinkler_type: 'pendent',
        k_factor: '5.6',
        design_pressure: '7',
        design_flow: '450',
      },
      pump: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
        exists: 'yes',
        type: 'UL',
        capacity: mv(750, 'GPM'),
        pressure: mv(8, 'bar'),
        rated_flow: mv(750, 'GPM'),
        rated_pressure: mv(8, 'bar'),
      },
      water_tank: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.water_tank,
        exists: 'yes',
        capacity_m3: mv(45, 'm³'),
        duration_min: mv(60, 'min'),
        water_demand_lpm: mv(750, 'L/min'),
        calculated_required_volume_m3: 45,
      },
      water_supply: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.water_supply,
        water_source: 'tank',
        tank_type: 'أرضي',
      },
      egress: {
        metrics: [
          { label: 'Travel distance', value: '40' },
          { label: 'Common path', value: '20' },
          { label: 'Dead end', value: '10' },
          { label: 'Corridor width', value: '1.2' },
          { label: 'Door width', value: '0.9' },
          { label: 'Stair width', value: '1.1' },
        ],
        notes: '',
      },
      fire_alarm: {
        ...EMPTY_FIRE_PROTECTION_DESIGN.fire_alarm,
        control_panel: 'Addressable FACP',
        smoke_detectors: 'optical',
        bells: 'horn/strobe',
        integration: 'sprinkler flow switch',
      },
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      occupancy_classification: 'Business',
      exits_count: '2',
      fire_alarm_system: 'نعم',
    },
    compliance: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.compliance,
      notes: 'CODE=NFPA-13;EDITION=2019',
    },
    ...partial,
  };
}

function baseResult(partial: Partial<ComplianceRuleResult>): ComplianceRuleResult {
  return {
    ruleId: 'TEST',
    code: 'NFPA-13',
    section: 'test',
    title: 'test',
    severity: 'mandatory',
    applicability: 'test',
    requiredInputs: [],
    status: 'PASS',
    effectiveStatus: 'PASS',
    message: 'ok',
    reason: 'ok',
    inputs: {},
    evidence: [],
    evidenceRequired: ['document'],
    ...partial,
  };
}

describe('NFPA architecture', () => {
  it('registers 42 NFPA architecture rules into authoritative COMPLIANCE_RULES', () => {
    expect(NFPA_RULE_DEFS).toHaveLength(42);
    expect(COMPLIANCE_RULES.length).toBe(126);
    expect(NFPA_AUTHORITY).toBe('lib/projects/compliance/nfpa');
    expect(CANONICAL_ENGINEERING_STORE).toBe('project_engineering_live.payload');
    for (const def of NFPA_RULE_DEFS) {
      expect(getComplianceRuleById(def.rule_id)).toBeTruthy();
    }
  });

  it('1. Valid NFPA input → rule can evaluate (structured, no invented PASS)', () => {
    const { findings } = runNfpaArchitectureFindings({
      client: baseClient(),
      data: dataWithFp(),
    });
    const density = findings.find((f) => f.rule_id === 'NFPA13-DENSITY');
    const hazard = findings.find((f) => f.rule_id === 'NFPA13-OCC-HAZARD');
    expect(hazard).toBeTruthy();
    expect(hazard!.status).toBe('RULE_NOT_CONFIGURED');
    expect(hazard!.authoritative).toBe(true);
    expect(hazard!.actual_value).toBe('ordinary_1');
    expect(hazard!.status).not.toBe('PASS');
    // density field not on FP schema yet
    expect(density!.status).toBe('NEEDS_DATA');

    const ctx = buildComplianceContext({ client: baseClient(), data: dataWithFp() });
    const rule = getComplianceRuleById('NFPA13-OCC-HAZARD')!;
    const ev = evaluateRule(rule, ctx);
    expect(ev.status).toBe('RULE_NOT_CONFIGURED');
    expect(ev.actual_value).toBe('ordinary_1');
  });

  it('2. Missing input → NEEDS_DATA', () => {
    const { findings } = runNfpaArchitectureFindings({
      client: baseClient(),
      data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
    });
    const hose = findings.find((f) => f.rule_id === 'NFPA13-HOSE-ALLOWANCE');
    expect(hose!.status).toBe('NEEDS_DATA');
    expect(hose!.input_state).toBe('MISSING');

    const suction = findings.find((f) => f.rule_id === 'NFPA20-SUCTION');
    expect(suction!.status).toBe('NEEDS_DATA');

    const usable = findings.find((f) => f.rule_id === 'NFPA22-USABLE-VOLUME');
    expect(usable!.status).toBe('NEEDS_DATA');
  });

  it('3. Invalid input → INVALID/NEEDS_DATA', () => {
    const ctx = buildNfpaEngineeringContext({
      client: baseClient(),
      data: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          sprinkler: {
            ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
            required: 'yes',
            k_factor: 'not-a-number',
          },
        },
      },
    });
    expect(ctx.nfpa13.k_factor.state).toBe('INVALID');
    const findings = evaluateNfpa13(ctx.nfpa13);
    const k = findings.find((f) => f.rule_id === 'NFPA13-K-FACTOR');
    expect(k!.status).toBe('NEEDS_DATA');
    expect(k!.input_state).toBe('INVALID');
  });

  it('4. Conflicting canonical sources → CONFLICT', () => {
    const merged = resolveCanonicalEngineeringDataset({
      live: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Business',
          exits_count: '2',
        },
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          egress: {
            metrics: [{ label: 'Travel distance', value: '40' }],
            notes: '',
          },
        },
      },
      legacy: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Assembly',
          exits_count: '3',
        },
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          egress: {
            metrics: [{ label: 'Travel distance', value: '55' }],
            notes: '',
          },
        },
      },
    });
    const nfpa = buildNfpaEngineeringContext({ client: baseClient(), data: merged });
    expect(nfpa.nfpa101.occupancy.state).toBe('CONFLICT');
    expect(nfpa.nfpa101.exits_count.state).toBe('CONFLICT');

    const { findings } = runNfpaArchitectureFindings({ client: baseClient(), data: merged });
    const conflicted = findings.filter((f) => f.status === 'CONFLICT');
    expect(conflicted.length).toBeGreaterThan(0);
    expect(conflicted.every((f) => f.status !== 'PASS')).toBe(true);
  });

  it('5. Advisory estimate → cannot create PASS', async () => {
    const water = await runKnowledgeBackedCalculation({
      projectId: 'p-nfpa',
      kind: 'water_demand',
      context: {
        client: baseClient({ building_area: 800 }),
        data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
      },
    });
    expect(water.status).toBe('estimated');
    expect(isAuthoritativeCalcResult(water)).toBe(false);

    const rejected = rejectAdvisoryPassAttempt({
      code: 'NFPA-13',
      rule_id: 'NFPA13-WATER-DEMAND',
      field: 'water_demand_lpm',
      advisory_source: 'calculation_estimate',
      advisory_value:
        typeof water.values?.estimated_demand_lpm === 'number'
          ? water.values.estimated_demand_lpm
          : null,
    });
    expect(rejected.status).toBe('NEEDS_DATA');
    expect(rejected.status).not.toBe('PASS');
    expect(rejected.authoritative).toBe(true);
  });

  it('6. Vision result → cannot create PASS', () => {
    expect(isNfpaAdvisorySource('lib/projects/design-center/vision')).toBe(true);
    const rejected = rejectAdvisoryPassAttempt({
      code: 'NFPA-13',
      rule_id: 'NFPA13-SPACING',
      field: 'sprinkler_spacing_m',
      advisory_source: 'lib/projects/design-center/vision',
      advisory_value: 3.5,
    });
    expect(rejected.status).not.toBe('PASS');
    expect(rejected.status).toBe('NEEDS_DATA');
  });

  it('7. DI recommendation → cannot create PASS', async () => {
    expect(isNfpaAdvisorySource('lib/design-intelligence')).toBe(true);
    const soft = validateCompliance({ activityType: 'مكتب', hasSprinklers: true });
    expect(soft.authoritative).toBe(false);

    const di = await runProjectKnowledgeCompliance({
      client: baseClient(),
      data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
    });
    expect(di.authoritative).toBe(false);

    const rejected = rejectAdvisoryPassAttempt({
      code: 'NFPA-101',
      rule_id: 'NFPA101-TRAVEL-DISTANCE',
      field: 'travel_distance_m',
      advisory_source: 'lib/design-intelligence',
      advisory_value: 61,
    });
    expect(rejected.status).not.toBe('PASS');
    for (const src of NFPA_ADVISORY_SOURCES) {
      expect(isNfpaAdvisorySource(src)).toBe(true);
    }
  });

  it('8. NFPA FAIL → cannot unlock stage', () => {
    const run = summarizeResults([
      baseResult({
        ruleId: 'NFPA13-DENSITY',
        status: 'FAIL',
        effectiveStatus: 'FAIL',
        message: 'density fail',
      }),
      baseResult({
        ruleId: 'OTHER-PASS',
        code: 'SBC 201',
        status: 'PASS',
        effectiveStatus: 'PASS',
      }),
    ]);
    expect(run.gate).toBe('BLOCKED');
    expect(gateBlockerMessages(run).some((m) => /FAIL|NFPA13/i.test(m))).toBe(true);

    for (const stage of COMPLIANCE_GATED_STAGES) {
      const blocked = approveWorkflowStage({
        stageId: stage,
        client: baseClient(),
        data: dataWithFp(),
      });
      expect(blocked.ok).toBe(false);
    }
  });

  it('9. NFPA PASS unlocks only when ALL authoritative gates pass', () => {
    const allow = summarizeResults([
      baseResult({ ruleId: 'NFPA13-OCC-HAZARD', status: 'PASS', effectiveStatus: 'PASS' }),
      baseResult({ ruleId: 'SBC-X', code: 'SBC 201', status: 'PASS', effectiveStatus: 'PASS' }),
    ]);
    expect(allow.gate).toBe('ALLOW');
    expect(allow.allMandatoryPass).toBe(true);

    const blockedByUnconfigured = summarizeResults([
      baseResult({ ruleId: 'NFPA13-OCC-HAZARD', status: 'PASS', effectiveStatus: 'PASS' }),
      baseResult({
        ruleId: 'NFPA13-DENSITY',
        status: 'RULE_NOT_CONFIGURED',
        effectiveStatus: 'RULE_NOT_CONFIGURED',
        message: 'table missing',
      }),
    ]);
    expect(blockedByUnconfigured.gate).toBe('BLOCKED');

    // Live engine with architecture rules cannot ALLOW (tables not encoded)
    const live = runProjectCompliance({ client: baseClient(), data: dataWithFp() });
    expect(live.gate).toBe('BLOCKED');
    expect(
      live.counts.RULE_NOT_CONFIGURED + live.counts.NEEDS_DATA + live.counts.CONFLICT
    ).toBeGreaterThan(0);
  });

  it('10. Legacy JSON cannot override canonical values', () => {
    const merged = resolveCanonicalEngineeringDataset({
      live: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          occupancy: {
            ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy,
            hazard_class: 'extra_hazard_1',
          },
          sprinkler: {
            ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
            required: 'yes',
            sprinkler_type: 'upright-live',
          },
        },
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Live Occ',
        },
      },
      legacy: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        fire_protection_design: {
          ...EMPTY_FIRE_PROTECTION_DESIGN,
          occupancy: {
            ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy,
            hazard_class: 'light',
          },
          sprinkler: {
            ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler,
            required: 'yes',
            sprinkler_type: 'legacy-type',
          },
        },
        building_plan: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
          occupancy_classification: 'Legacy Occ',
        },
      },
    });

    expect(merged.fire_protection_design?.occupancy.hazard_class).toBe('extra_hazard_1');
    expect(merged.fire_protection_design?.sprinkler.sprinkler_type).toBe('upright-live');
    expect(merged.building_plan.occupancy_classification).toBe('Live Occ');

    const nfpa = buildNfpaEngineeringContext({ client: baseClient(), data: merged });
    expect(nfpa.nfpa13.hazard_class.value).toBe('extra_hazard_1');
    expect(nfpa.nfpa13.sprinkler_type.value).toBe('upright-live');
    // Must not silently take legacy
    expect(nfpa.nfpa13.hazard_class.value).not.toBe('light');
    expect(nfpa.nfpa13.sprinkler_type.value).not.toBe('legacy-type');
  });

  it('NFPA 101 shares canonical egress with SBC context (no competing engine)', () => {
    const data = dataWithFp();
    const ctx = buildComplianceContext({ client: baseClient(), data });
    expect(ctx.nfpa).toBeTruthy();
    expect(ctx.nfpa!.nfpa101.travel_distance_m.state).toBe('VALID');
    expect(ctx.nfpa!.nfpa101.travel_distance_m.value).toBe(40);
    // Same canonical value as SBC egress context
    expect(ctx.egress.travel_distance_m).toBe(40);
    expect(ctx.egress.travel_distance_m).toBe(ctx.nfpa!.nfpa101.travel_distance_m.value);
  });

  it('never invents PASS from empty or partial NFPA domains', () => {
    const { findings } = runNfpaArchitectureFindings({
      client: baseClient(),
      data: dataWithFp(),
    });
    expect(findings.every((f) => f.status !== 'PASS')).toBe(true);
    expect(findings.every((f) => f.authoritative === true)).toBe(true);
  });
});
