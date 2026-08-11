import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_RULES,
  getComplianceRuleById,
  isFullyCompliant,
  requiredExitsFromOccupantLoad,
  resolveBuildingAreaM2,
  resolveConstructionType,
  resolveTravelDistanceLimitM,
  resolveFireAccessMinWidthM,
  runProjectCompliance,
  complianceStatusLabelAr,
  type ComplianceRuleContext,
} from '@/lib/projects/compliance';
import { evaluateRule, runComplianceRules } from '@/lib/projects/compliance/engine';
import { stageApprovalBlockers } from '@/lib/projects/gated-pipeline';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import { buildComplianceContext } from '@/lib/projects/compliance/context';

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
  const base: ComplianceRuleContext = {
    evaluatedAt: new Date().toISOString(),
    client: { activity_type: 'مكاتب', floors_count: 3, building_area: 2000 },
    building: {
      occupancy_classification: null,
      building_type_code: null,
      group_letter: null,
      construction_type: null,
      building_area_m2: null,
      total_site_area_m2: null,
      building_height_m: null,
      stories: null,
      basement_floors: null,
      high_rise: null,
      mixed_occupancy: null,
      underground: null,
      windowless: null,
      atrium: null,
      special_conditions: [],
      primary_occupancy_code: null,
    },
    occupancyZones: [],
    egress: { metrics: [] },
    fireAccess: {},
    fireProtection: { applicable_codes: ['SBC 201', 'SBC 801'] },
    hydraulic: { has_network_data: false, attachment_count: 0 },
    fireAlarm: {},
    smokeControl: {},
    overrides: [],
  };
  return {
    ...base,
    ...partial,
    building: { ...base.building, ...(partial.building || {}) },
    egress: { ...base.egress, ...(partial.egress || {}) },
    fireAccess: { ...base.fireAccess, ...(partial.fireAccess || {}) },
    fireProtection: { ...base.fireProtection, ...(partial.fireProtection || {}) },
    hydraulic: { ...base.hydraulic, ...(partial.hydraulic || {}) },
    fireAlarm: { ...base.fireAlarm, ...(partial.fireAlarm || {}) },
    smokeControl: { ...base.smokeControl, ...(partial.smokeControl || {}) },
  };
}

describe('Saudi Code Compliance Engine — hardened', () => {
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

  describe('building area vs site area', () => {
    it('does not use total_site_area as building area substitute', () => {
      expect(
        resolveBuildingAreaM2({
          fpArea: null,
          clientBuildingArea: null,
          zoneAreasSum: null,
        })
      ).toBeNull();
      expect(resolveBuildingAreaM2({ fpArea: '1500', clientBuildingArea: null, zoneAreasSum: null })).toBe(1500);
      expect(resolveBuildingAreaM2({ fpArea: null, clientBuildingArea: 2000, zoneAreasSum: null })).toBe(2000);
    });

    it('context keeps site area separate from building area', () => {
      const ctx = buildComplianceContext({
        client: baseClient({ building_area: 1800 }),
        data: {
          ...EMPTY_PROJECT_ENGINEERING_DATA,
          building_plan: {
            ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
            total_site_area_m2: '9000',
            building_type_code: 'Type II-B',
          },
        },
      });
      expect(ctx.building.building_area_m2).toBe(1800);
      expect(ctx.building.total_site_area_m2).toBe(9000);
      expect(ctx.building.construction_type).toBe('Type II-B');
    });
  });

  describe('construction_type', () => {
    it('resolves only known SBC construction types', () => {
      expect(resolveConstructionType('Type I-A')).toBe('Type I-A');
      expect(resolveConstructionType('مكاتب')).toBeNull();
      expect(resolveConstructionType('')).toBeNull();
    });

    it('OCC-03 NEEDS_DATA when construction_type missing even if building_type_code raw differs', () => {
      const rule = getComplianceRuleById('OCC-03')!;
      const result = evaluateRule(
        rule,
        emptyCtx({
          building: {
            ...emptyCtx().building,
            building_type_code: 'commercial-office',
            construction_type: null,
          },
        })
      );
      expect(result.status).toBe('NEEDS_DATA');
    });
  });

  describe('requiredExitsFromOccupantLoad boundaries', () => {
    it('returns null without occupancy classification', () => {
      expect(requiredExitsFromOccupantLoad(100, null)).toBeNull();
      expect(requiredExitsFromOccupantLoad(100, {})).toBeNull();
    });

    it('bands: below / equal / above thresholds', () => {
      const occ = { classification: 'GROUP B' };
      expect(requiredExitsFromOccupantLoad(49, occ)?.required).toBe(1);
      expect(requiredExitsFromOccupantLoad(50, occ)?.required).toBe(2);
      expect(requiredExitsFromOccupantLoad(500, occ)?.required).toBe(2);
      expect(requiredExitsFromOccupantLoad(501, occ)?.required).toBe(3);
      expect(requiredExitsFromOccupantLoad(1500, occ)?.required).toBe(4);
    });

    it('EGR-02 NEEDS_DATA without occupancy even with load+exits', () => {
      const rule = getComplianceRuleById('EGR-02')!;
      const result = evaluateRule(
        rule,
        emptyCtx({
          egress: { metrics: [], occupant_load_total: 120, exits_count: 2 },
        })
      );
      expect(result.status).toBe('NEEDS_DATA');
    });

    it('EGR-02 FAIL below required, PASS at/above', () => {
      const rule = getComplianceRuleById('EGR-02')!;
      const fail = evaluateRule(
        rule,
        emptyCtx({
          building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
          egress: { metrics: [], occupant_load_total: 120, exits_count: 1 },
        })
      );
      expect(fail.status).toBe('FAIL');
      expect(fail.required_value).toBe(2);
      expect(fail.code_reference).toMatch(/1006|1004/);

      const pass = evaluateRule(
        rule,
        emptyCtx({
          building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
          egress: { metrics: [], occupant_load_total: 120, exits_count: 2 },
        })
      );
      expect(pass.status).toBe('PASS');
    });
  });

  describe('EGR threshold comparisons', () => {
    it('EGR-06 NEEDS_DATA when distance present but sprinkler/occupancy incomplete', () => {
      const rule = getComplianceRuleById('EGR-06')!;
      const r = evaluateRule(
        rule,
        emptyCtx({
          egress: { metrics: [], travel_distance_m: 40 },
        })
      );
      expect(r.status).toBe('NEEDS_DATA');
    });

    it('EGR-06 boundary vs documented travel limit', () => {
      const rule = getComplianceRuleById('EGR-06')!;
      const base = emptyCtx({
        building: {
          ...emptyCtx().building,
          occupancy_classification: 'GROUP B — مكاتب',
          primary_occupancy_code: 'business',
        },
        fireProtection: { applicable_codes: [], sprinkler_provided: 'no' },
      });
      const limit = resolveTravelDistanceLimitM(base);
      expect(limit).not.toBeNull();

      const under = evaluateRule(rule, {
        ...base,
        egress: { metrics: [], travel_distance_m: (limit!.value as number) - 1 },
      });
      expect(under.status).toBe('PASS');

      const equal = evaluateRule(rule, {
        ...base,
        egress: { metrics: [], travel_distance_m: limit!.value },
      });
      expect(equal.status).toBe('PASS');

      const over = evaluateRule(rule, {
        ...base,
        egress: { metrics: [], travel_distance_m: (limit!.value as number) + 1 },
      });
      expect(over.status).toBe('FAIL');
    });

    it('EGR-05 NEEDS_DATA without engineer-documented required separation', () => {
      const rule = getComplianceRuleById('EGR-05')!;
      const r = evaluateRule(
        rule,
        emptyCtx({
          building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
          fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
          egress: { metrics: [], occupant_load_total: 120, exit_separation_m: 20 },
        })
      );
      expect(r.status).toBe('NEEDS_DATA');
    });

    it('EGR-09 does not PASS on measurement alone', () => {
      const rule = getComplianceRuleById('EGR-09')!;
      const r = evaluateRule(rule, emptyCtx({ egress: { metrics: [], corridor_width_m: 1.2 } }));
      expect(r.status).toBe('NEEDS_DATA');
    });

    it('EGR-09 PASS/FAIL when required width documented', () => {
      const rule = getComplianceRuleById('EGR-09')!;
      const fail = evaluateRule(
        rule,
        emptyCtx({
          egress: { metrics: [], corridor_width_m: 0.9, required_corridor_width_m: 1.1 },
        })
      );
      expect(fail.status).toBe('FAIL');
      const pass = evaluateRule(
        rule,
        emptyCtx({
          egress: { metrics: [], corridor_width_m: 1.1, required_corridor_width_m: 1.1 },
        })
      );
      expect(pass.status).toBe('PASS');
    });
  });

  describe('FAC-02 fire access width', () => {
    it('NEEDS_DATA without documented code threshold (no invented 6m)', () => {
      const rule = getComplianceRuleById('FAC-02')!;
      const r = evaluateRule(rule, emptyCtx({ fireAccess: { road_width_m: 7 } }));
      expect(r.status).toBe('NEEDS_DATA');
      expect(r.message).toMatch(/6\s*م|threshold|حد|code_ref|موثّق/i);
      expect(resolveFireAccessMinWidthM(emptyCtx({ fireAccess: { road_width_m: 7 } }))).toBeNull();
    });

    it('compares against project-documented required width + code ref', () => {
      const rule = getComplianceRuleById('FAC-02')!;
      const ctxBase = {
        fireAccess: {
          road_width_m: 5,
          required_road_width_m: 6,
          required_road_width_code_ref: 'SBC 801 / CD access width (project table)',
        },
      };
      expect(evaluateRule(rule, emptyCtx(ctxBase)).status).toBe('FAIL');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            fireAccess: { ...ctxBase.fireAccess, road_width_m: 6 },
          })
        ).status
      ).toBe('PASS');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            fireAccess: { ...ctxBase.fireAccess, road_width_m: 7 },
          })
        ).status
      ).toBe('PASS');
    });
  });

  describe('FP-01 required / provided / verified', () => {
    it('NEEDS_DATA when required but only claimed provided without verification', () => {
      const rule = getComplianceRuleById('FP-01')!;
      const r = evaluateRule(
        rule,
        emptyCtx({
          building: {
            ...emptyCtx().building,
            primary_occupancy_code: 'residential',
            building_area_m2: 500,
          },
          fireProtection: {
            applicable_codes: [],
            sprinkler_provided: 'yes',
            sprinkler_verified: false,
          },
        })
      );
      expect(r.status).toBe('NEEDS_DATA');
    });

    it('FAIL when required and provided=no', () => {
      const rule = getComplianceRuleById('FP-01')!;
      const r = evaluateRule(
        rule,
        emptyCtx({
          building: {
            ...emptyCtx().building,
            primary_occupancy_code: 'high_hazard',
            building_area_m2: 200,
          },
          fireProtection: {
            applicable_codes: [],
            sprinkler_provided: 'no',
            sprinkler_verified: false,
          },
        })
      );
      expect(r.status).toBe('FAIL');
    });

    it('PASS when required+provided+verified', () => {
      const rule = getComplianceRuleById('FP-01')!;
      const r = evaluateRule(
        rule,
        emptyCtx({
          building: {
            ...emptyCtx().building,
            primary_occupancy_code: 'residential',
            building_area_m2: 500,
          },
          fireProtection: {
            applicable_codes: [],
            sprinkler_provided: 'yes',
            sprinkler_verified: true,
            sprinkler_system_type: 'wet',
          },
        })
      );
      expect(r.status).toBe('PASS');
    });
  });

  describe('FA-01 alarm required/provided/verified', () => {
    it('NEEDS_DATA when required but not verified', () => {
      const rule = getComplianceRuleById('FA-01')!;
      const r = evaluateRule(
        rule,
        emptyCtx({
          building: {
            ...emptyCtx().building,
            primary_occupancy_code: 'residential',
          },
          egress: { metrics: [], occupant_load_total: 10 },
          fireAlarm: { provided: 'yes', verified: false },
        })
      );
      expect(['NEEDS_DATA', 'FAIL', 'PASS']).toContain(r.status);
      // residential has alarm_always → required; without verified → not PASS
      expect(r.status).not.toBe('PASS');
    });
  });

  describe('HYD-01', () => {
    it('attachment_count alone never PASS', () => {
      const rule = getComplianceRuleById('HYD-01')!;
      const r = evaluateRule(
        rule,
        emptyCtx({
          fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
          hydraulic: { has_network_data: false, attachment_count: 3 },
        })
      );
      expect(r.status).toBe('NEEDS_DATA');
    });

    it('PASS only with full network fields', () => {
      const rule = getComplianceRuleById('HYD-01')!;
      const full = {
        has_network_data: true,
        attachment_count: 1,
        k_factor: 5.6,
        flow_lpm: 900,
        pressure_bar: 4.5,
        required_residual_pressure_bar: 1,
        pipe_diameter_mm: 50,
        pipe_length_m: 40,
        elevation_m: 3,
        friction_loss_bar: 0.4,
        remote_area_m2: 140,
        node_demand_lpm: 100,
        pump_flow_lpm: 1200,
        pump_pressure_bar: 8,
        tank_volume_m3: 72,
      };
      const r = evaluateRule(
        rule,
        emptyCtx({
          fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
          hydraulic: full,
        })
      );
      expect(r.status).toBe('PASS');
    });
  });

  describe('override identity + original status', () => {
    it('rejects override without engineer identity; keeps original status', () => {
      const run = runComplianceRules(
        emptyCtx({
          overrides: [
            {
              ruleId: 'OCC-01',
              reason: 'تصنيف موثّق في رخصة البناء المرفقة',
              codeReference: 'SBC 201 §302',
              overriddenAt: new Date().toISOString(),
              resultingStatus: 'PASS',
            },
          ],
        }),
        [getComplianceRuleById('OCC-01')!]
      );
      expect(run.results[0].status).toBe('NEEDS_DATA');
      expect(run.results[0].effectiveStatus).toBe('NEEDS_DATA');
    });

    it('accepted override keeps original status visible', () => {
      const run = runComplianceRules(
        emptyCtx({
          overrides: [
            {
              ruleId: 'OCC-01',
              reason: 'تصنيف موثّق في رخصة البناء المرفقة',
              codeReference: 'SBC 201 §302',
              engineerName: 'م. أحمد',
              overriddenAt: new Date().toISOString(),
              resultingStatus: 'PASS',
            },
          ],
        }),
        [getComplianceRuleById('OCC-01')!]
      );
      expect(run.results[0].status).toBe('NEEDS_DATA');
      expect(run.results[0].effectiveStatus).toBe('PASS');
      expect(run.results[0].message).toMatch(/الأصل|NEEDS_DATA/);
    });
  });

  it('empty project run is BLOCKED', () => {
    const run = runProjectCompliance({
      client: baseClient(),
      data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
    });
    expect(run.gate).toBe('BLOCKED');
    expect(isFullyCompliant(run)).toBe(false);
    expect(run.matrix[0].actual).toBeDefined();
    expect(run.matrix[0].code_reference).toBeDefined();
  });

  it('workflow gates still block gated stages', () => {
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

  it('SMK-01 ventilation-only is not PASS', () => {
    const rule = getComplianceRuleById('SMK-01')!;
    const result = evaluateRule(
      rule,
      emptyCtx({
        smokeControl: { required: true, status: 'unknown', ventilation_only: true },
      })
    );
    expect(result.status).not.toBe('PASS');
  });

  it('FP-04 pump flow is not sprinkler demand', () => {
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
  });

  describe('Final Verification — boundary matrix for key rules', () => {
    it('lists expected rule count domains (44 rules)', () => {
      expect(COMPLIANCE_RULES.length).toBe(44);
      expect(COMPLIANCE_RULES.map((r) => r.id).sort()).toEqual(
        [
          'OCC-01','OCC-02','OCC-03','OCC-04','OCC-05','OCC-06','OCC-07','OCC-08',
          'EGR-01','EGR-02','EGR-03','EGR-04','EGR-05','EGR-06','EGR-07','EGR-08','EGR-09','EGR-10','EGR-11','EGR-12',
          'FAC-01','FAC-02','FAC-03','FAC-04','FAC-05',
          'FP-01','FP-02','FP-03','FP-04','FP-05','FP-06','FP-07','FP-08','FP-09','FP-10',
          'HYD-01',
          'FA-01','FA-02','FA-03','FA-04','FA-05','FA-06','FA-07',
          'SMK-01',
        ].sort()
      );
    });

    function boundaryCompare(
      ruleId: string,
      makeCtx: (actual: number | null, required: number | null) => ComplianceRuleContext,
      opts?: { missingRequiredAlsoNeedsCodeRef?: boolean }
    ) {
      const rule = getComplianceRuleById(ruleId)!;
      expect(evaluateRule(rule, makeCtx(5, 6)).status).toBe('FAIL'); // actual < required (gte)
      expect(evaluateRule(rule, makeCtx(6, 6)).status).toBe('PASS');
      expect(evaluateRule(rule, makeCtx(7, 6)).status).toBe('PASS');
      expect(evaluateRule(rule, makeCtx(null, 6)).status).toBe('NEEDS_DATA');
      expect(evaluateRule(rule, makeCtx(6, null)).status).toBe('NEEDS_DATA');
      void opts;
    }

    it('EGR-05: < = > missing actual, missing required, missing occupancy/sprinkler', () => {
      const rule = getComplianceRuleById('EGR-05')!;
      const base = {
        building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
        fireProtection: { applicable_codes: [] as string[], sprinkler_provided: 'yes' as const },
        egress: { metrics: [] as Array<{ label: string; value: string }>, occupant_load_total: 120 },
      };
      expect(
        evaluateRule(rule, emptyCtx({ ...base, egress: { ...base.egress, exit_separation_m: 10, required_exit_separation_m: 20 } })).status
      ).toBe('FAIL');
      expect(
        evaluateRule(rule, emptyCtx({ ...base, egress: { ...base.egress, exit_separation_m: 20, required_exit_separation_m: 20 } })).status
      ).toBe('PASS');
      expect(
        evaluateRule(rule, emptyCtx({ ...base, egress: { ...base.egress, exit_separation_m: 25, required_exit_separation_m: 20 } })).status
      ).toBe('PASS');
      expect(
        evaluateRule(rule, emptyCtx({ ...base, egress: { ...base.egress, exit_separation_m: null, required_exit_separation_m: 20 } })).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(rule, emptyCtx({ ...base, egress: { ...base.egress, exit_separation_m: 20, required_exit_separation_m: null } })).status
      ).toBe('NEEDS_DATA');
      // missing occupancy → threshold null
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
            egress: { metrics: [], occupant_load_total: 120, exit_separation_m: 20, required_exit_separation_m: 20 },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('EGR-06: missing actual / missing occupancy / missing sprinkler → NEEDS_DATA; boundaries when documented', () => {
      const rule = getComplianceRuleById('EGR-06')!;
      expect(evaluateRule(rule, emptyCtx({ egress: { metrics: [] } })).status).toBe('NEEDS_DATA');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B', primary_occupancy_code: 'business' },
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
            egress: { metrics: [] },
          })
        ).status
      ).toBe('NEEDS_DATA'); // missing actual

      const withOcc = emptyCtx({
        building: {
          ...emptyCtx().building,
          occupancy_classification: 'GROUP B — مكاتب',
          primary_occupancy_code: 'business',
        },
        fireProtection: { applicable_codes: [], sprinkler_provided: 'no' },
      });
      const limit = resolveTravelDistanceLimitM(withOcc)!.value;
      expect(evaluateRule(rule, { ...withOcc, egress: { metrics: [], travel_distance_m: limit - 1 } }).status).toBe('PASS');
      expect(evaluateRule(rule, { ...withOcc, egress: { metrics: [], travel_distance_m: limit } }).status).toBe('PASS');
      expect(evaluateRule(rule, { ...withOcc, egress: { metrics: [], travel_distance_m: limit + 1 } }).status).toBe('FAIL');
    });

    it('EGR-09/10/11: no PASS on measurement alone; boundaries with required', () => {
      for (const [id, actualKey, requiredKey] of [
        ['EGR-09', 'corridor_width_m', 'required_corridor_width_m'],
        ['EGR-10', 'door_width_m', 'required_door_width_m'],
        ['EGR-11', 'stair_width_m', 'required_stair_width_m'],
      ] as const) {
        const rule = getComplianceRuleById(id)!;
        const onlyActual = emptyCtx({
          building: { ...emptyCtx().building, stories: 3 },
          egress: {
            metrics: [],
            stairs_count: 2,
            [actualKey]: 1.2,
          },
        });
        expect(evaluateRule(rule, onlyActual).status).toBe('NEEDS_DATA');

        const fail = emptyCtx({
          building: { ...emptyCtx().building, stories: 3 },
          egress: { metrics: [], stairs_count: 2, [actualKey]: 0.8, [requiredKey]: 1.1 },
        });
        expect(evaluateRule(rule, fail).status).toBe('FAIL');

        const equal = emptyCtx({
          building: { ...emptyCtx().building, stories: 3 },
          egress: { metrics: [], stairs_count: 2, [actualKey]: 1.1, [requiredKey]: 1.1 },
        });
        expect(evaluateRule(rule, equal).status).toBe('PASS');

        const over = emptyCtx({
          building: { ...emptyCtx().building, stories: 3 },
          egress: { metrics: [], stairs_count: 2, [actualKey]: 1.4, [requiredKey]: 1.1 },
        });
        expect(evaluateRule(rule, over).status).toBe('PASS');

        const missingRequired = emptyCtx({
          building: { ...emptyCtx().building, stories: 3 },
          egress: { metrics: [], stairs_count: 2, [actualKey]: 1.2, [requiredKey]: null },
        });
        expect(evaluateRule(rule, missingRequired).status).toBe('NEEDS_DATA');
      }
    });

    it('FAC-01/02: narrative alone never PASS; threshold comparison boundaries', () => {
      const fac01 = getComplianceRuleById('FAC-01')!;
      expect(
        evaluateRule(fac01, emptyCtx({ fireAccess: { site_entrance: 'مدخل شمالي واسع' } })).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(fac01, emptyCtx({ fireAccess: { road_width_m: 7 } })).status
      ).toBe('NEEDS_DATA');

      boundaryCompare('FAC-02', (actual, required) =>
        emptyCtx({
          fireAccess: {
            road_width_m: actual,
            required_road_width_m: required ?? undefined,
            required_road_width_code_ref: required != null ? 'SBC 801 project table' : undefined,
          },
        })
      );

      // missing code ref → NEEDS_DATA even with required number
      const fac02 = getComplianceRuleById('FAC-02')!;
      expect(
        evaluateRule(
          fac02,
          emptyCtx({ fireAccess: { road_width_m: 7, required_road_width_m: 6, required_road_width_code_ref: '' } })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('FAC-03/04: text alone never PASS', () => {
      expect(
        evaluateRule(getComplianceRuleById('FAC-03')!, emptyCtx({ fireAccess: { notes: 'منطقة تمركز' } })).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(getComplianceRuleById('FAC-04')!, emptyCtx({ fireAccess: { fire_road: 'طريق التفاف' } })).status
      ).toBe('NEEDS_DATA');
    });

    it('FP-01: missing occupancy → NEEDS_DATA; claim without verify → NEEDS_DATA', () => {
      const rule = getComplianceRuleById('FP-01')!;
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes', sprinkler_verified: true },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('FA-01: missing occupancy path → not PASS; verified path PASS', () => {
      const rule = getComplianceRuleById('FA-01')!;
      const missingOcc = evaluateRule(
        rule,
        emptyCtx({
          egress: { metrics: [], occupant_load_total: 200 },
          fireAlarm: { provided: 'yes', verified: true },
        })
      );
      expect(missingOcc.status).not.toBe('PASS');

      const pass = evaluateRule(
        rule,
        emptyCtx({
          building: { ...emptyCtx().building, primary_occupancy_code: 'residential' },
          egress: { metrics: [], occupant_load_total: 10 },
          fireAlarm: { provided: 'yes', verified: true },
        })
      );
      expect(pass.status).toBe('PASS');
    });

    it('HYD-01: missing hydraulic network → NEEDS_DATA; invalid when sprinkler not in scope → N/A', () => {
      const rule = getComplianceRuleById('HYD-01')!;
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
            hydraulic: { has_network_data: false, attachment_count: 0 },
          })
        ).status
      ).toBe('NEEDS_DATA');

      expect(
        evaluateRule(
          rule,
          emptyCtx({
            fireProtection: { applicable_codes: [], sprinkler_provided: 'no', sprinkler_required: 'no' },
            hydraulic: { has_network_data: false, attachment_count: 0 },
          })
        ).status
      ).toBe('N/A');
    });

    it('invalid construction type → OCC-03 NEEDS_DATA', () => {
      const rule = getComplianceRuleById('OCC-03')!;
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: {
              ...emptyCtx().building,
              building_type_code: 'random-office',
              construction_type: null,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('assessment labels never say absolute مطابق alone', () => {
      const run = runProjectCompliance({
        client: baseClient(),
        data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
      });
      const label = complianceStatusLabelAr(run);
      expect(label).toMatch(/تقييم مطابقة/);
      expect(label).not.toBe('مطابق');
      expect(label).not.toBe('غير مطابق');
    });

    it('override stores reason + codeReference + identity + timestamp; status unchanged', () => {
      const at = '2026-08-11T12:00:00.000Z';
      const run = runComplianceRules(
        emptyCtx({
          overrides: [
            {
              ruleId: 'FAC-03',
              reason: 'تم اعتماد خلوص المناورة في مخطط الموقع الموقع من الدفاع المدني',
              codeReference: 'SBC 801 / project AHJ letter',
              engineerName: 'م. سارة',
              overriddenAt: at,
              resultingStatus: 'PASS',
            },
          ],
        }),
        [getComplianceRuleById('FAC-03')!]
      );
      const row = run.results[0];
      expect(row.status).toBe('NEEDS_DATA');
      expect(row.effectiveStatus).toBe('PASS');
      expect(row.override?.reason.length).toBeGreaterThanOrEqual(8);
      expect(row.override?.codeReference).toMatch(/SBC/);
      expect(row.override?.engineerName).toBe('م. سارة');
      expect(row.override?.overriddenAt).toBe(at);
    });
  });
});
