import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_RULES,
  RULE_CODE_REFS,
  COMPLIANCE_ASSESSMENT_DISCLAIMER_AR,
  getComplianceRuleById,
  isFullyCompliant,
  requiredExitsFromOccupantLoad,
  resolveBuildingAreaM2,
  resolveConstructionType,
  resolveTravelDistanceLimitM,
  resolveFireAccessMinWidthM,
  resolveExitSeparationMinM,
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

describe('Saudi Code Compliance Engine — final citation audit', () => {
  it('registers 126 rules with precise code citations', () => {
    expect(COMPLIANCE_RULES.length).toBe(126);
    for (const r of COMPLIANCE_RULES) {
      expect(RULE_CODE_REFS[r.id], `missing citation for ${r.id}`).toBeTruthy();
      expect(RULE_CODE_REFS[r.id].citation.length).toBeGreaterThan(10);
      expect(RULE_CODE_REFS[r.id].citation).not.toMatch(/^SBC 801 \/ [A-Z][a-z]+$/);
    }
  });

  describe('building area vs site area', () => {
    it('does not use total_site_area as building area substitute', () => {
      expect(resolveBuildingAreaM2({ fpArea: null, clientBuildingArea: null, zoneAreasSum: null })).toBeNull();
      expect(resolveBuildingAreaM2({ fpArea: '1500', clientBuildingArea: null, zoneAreasSum: null })).toBe(1500);
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
      // Site area must never become building area. CRM building_area alone is not
      // canonical for compliance (Phase 2.3) — requires FP area or zone sum.
      expect(ctx.building.building_area_m2).toBeNull();
      expect(ctx.building.total_site_area_m2).toBe(9000);
      expect(ctx.building.building_area_m2).not.toBe(9000);
    });
  });

  describe('construction_type', () => {
    it('OCC-03 NEEDS_DATA for invalid construction type', () => {
      const rule = getComplianceRuleById('OCC-03')!;
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, building_type_code: 'commercial-office', construction_type: null },
          })
        ).status
      ).toBe('NEEDS_DATA');
      expect(resolveConstructionType('مكاتب')).toBeNull();
    });
  });

  describe('EGR-02 exits (platform_code_table)', () => {
    it('NEEDS_DATA without occupancy', () => {
      const rule = getComplianceRuleById('EGR-02')!;
      expect(
        evaluateRule(rule, emptyCtx({ egress: { metrics: [], occupant_load_total: 120, exits_count: 2 } })).status
      ).toBe('NEEDS_DATA');
      expect(requiredExitsFromOccupantLoad(100, null)).toBeNull();
    });

    it('FAIL below / PASS at-or-above required exits', () => {
      const rule = getComplianceRuleById('EGR-02')!;
      const fail = evaluateRule(
        rule,
        emptyCtx({
          building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
          egress: { metrics: [], occupant_load_total: 120, exits_count: 1 },
        })
      );
      expect(fail.status).toBe('FAIL');
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

  describe('project_design thresholds never auto-PASS as code', () => {
    it('EGR-05: project required_exit_separation_m → NEEDS_DATA (not code table)', () => {
      const rule = getComplianceRuleById('EGR-05')!;
      const thr = resolveExitSeparationMinM(
        emptyCtx({
          building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
          fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
          egress: { metrics: [], required_exit_separation_m: 20 },
        })
      );
      expect(thr?.sourceKind).toBe('project_design');

      for (const [actual, label] of [
        [10, 'below'],
        [20, 'equal'],
        [25, 'above'],
      ] as const) {
        const r = evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
            egress: {
              metrics: [],
              occupant_load_total: 120,
              exit_separation_m: actual,
              required_exit_separation_m: 20,
            },
          })
        );
        expect(r.status, label).toBe('NEEDS_DATA');
        expect(r.message).toMatch(/تصميم|مشروع|project_design|ليست مرجعًا كوديًا/i);
      }

      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
            egress: { metrics: [], occupant_load_total: 120, exit_separation_m: null, required_exit_separation_m: 20 },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('EGR-06: travel distance has no platform table — always NEEDS_DATA for compare', () => {
      const rule = getComplianceRuleById('EGR-06')!;
      expect(resolveTravelDistanceLimitM(emptyCtx())).toBeNull();
      expect(evaluateRule(rule, emptyCtx({ egress: { metrics: [] } })).status).toBe('NEEDS_DATA');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: {
              ...emptyCtx().building,
              occupancy_classification: 'GROUP B',
              primary_occupancy_code: 'business',
            },
            fireProtection: { applicable_codes: [], sprinkler_provided: 'no' },
            egress: { metrics: [], travel_distance_m: 40 },
          })
        ).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, primary_occupancy_code: 'business' },
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
            egress: { metrics: [], travel_distance_m: 100 },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('EGR-07/08: measurement alone → NEEDS_DATA', () => {
      expect(
        evaluateRule(getComplianceRuleById('EGR-07')!, emptyCtx({ egress: { metrics: [], common_path_m: 20 } })).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(getComplianceRuleById('EGR-07')!, emptyCtx({ egress: { metrics: [] } })).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(getComplianceRuleById('EGR-08')!, emptyCtx({ egress: { metrics: [], dead_end_m: 15 } })).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(getComplianceRuleById('EGR-08')!, emptyCtx({ egress: { metrics: [] } })).status
      ).toBe('NEEDS_DATA');
    });

    it('EGR-09/10/11: project required_* never PASS as code', () => {
      for (const [id, actualKey, requiredKey] of [
        ['EGR-09', 'corridor_width_m', 'required_corridor_width_m'],
        ['EGR-10', 'door_width_m', 'required_door_width_m'],
        ['EGR-11', 'stair_width_m', 'required_stair_width_m'],
      ] as const) {
        const rule = getComplianceRuleById(id)!;
        expect(
          evaluateRule(
            rule,
            emptyCtx({
              building: { ...emptyCtx().building, stories: 3 },
              egress: { metrics: [], stairs_count: 2, [actualKey]: 1.2 },
            })
          ).status
        ).toBe('NEEDS_DATA');

        for (const actual of [0.8, 1.1, 1.4]) {
          const r = evaluateRule(
            rule,
            emptyCtx({
              building: { ...emptyCtx().building, stories: 3 },
              egress: { metrics: [], stairs_count: 2, [actualKey]: actual, [requiredKey]: 1.1 },
            })
          );
          expect(r.status).toBe('NEEDS_DATA');
          expect(r.required_value_source || r.inputs?.required_source_kind).toMatch(/project_design/);
        }
      }
    });

    it('FAC-01/02: narrative or project width+ref → NEEDS_DATA (no invented 6m PASS)', () => {
      const fac01 = getComplianceRuleById('FAC-01')!;
      const fac02 = getComplianceRuleById('FAC-02')!;
      expect(evaluateRule(fac01, emptyCtx({ fireAccess: { site_entrance: 'مدخل' } })).status).toBe('NEEDS_DATA');
      expect(evaluateRule(fac02, emptyCtx({ fireAccess: { road_width_m: 7 } })).status).toBe('NEEDS_DATA');
      expect(resolveFireAccessMinWidthM(emptyCtx({ fireAccess: { road_width_m: 7 } }))).toBeNull();

      const withProject = {
        road_width_m: 5,
        required_road_width_m: 6,
        required_road_width_code_ref: 'SBC 801 project note',
      };
      expect(resolveFireAccessMinWidthM(emptyCtx({ fireAccess: withProject }))?.sourceKind).toBe('project_design');
      for (const w of [5, 6, 7]) {
        expect(
          evaluateRule(fac02, emptyCtx({ fireAccess: { ...withProject, road_width_m: w } })).status
        ).toBe('NEEDS_DATA');
        expect(
          evaluateRule(fac01, emptyCtx({ fireAccess: { ...withProject, road_width_m: w } })).status
        ).toBe('NEEDS_DATA');
      }
    });

    it('FAC-03/04: text alone → NEEDS_DATA', () => {
      expect(
        evaluateRule(getComplianceRuleById('FAC-03')!, emptyCtx({ fireAccess: { notes: 'تمركز' } })).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(getComplianceRuleById('FAC-04')!, emptyCtx({ fireAccess: { fire_road: 'التفاف' } })).status
      ).toBe('NEEDS_DATA');
    });
  });

  describe('FP / FA / HYD critical', () => {
    it('FP-01 required/provided/verified', () => {
      const rule = getComplianceRuleById('FP-01')!;
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, primary_occupancy_code: 'residential', building_area_m2: 500 },
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes', sprinkler_verified: false },
          })
        ).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, primary_occupancy_code: 'high_hazard', building_area_m2: 200 },
            fireProtection: { applicable_codes: [], sprinkler_provided: 'no', sprinkler_verified: false },
          })
        ).status
      ).toBe('FAIL');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, primary_occupancy_code: 'residential', building_area_m2: 500 },
            fireProtection: {
              applicable_codes: [],
              sprinkler_provided: 'yes',
              sprinkler_verified: true,
              sprinkler_system_type: 'wet',
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, primary_occupancy_code: 'residential', building_area_m2: 500 },
            fireProtection: {
              applicable_codes: [],
              sprinkler_provided: 'yes',
              sprinkler_verified: true,
              sprinkler_system_type: 'wet',
              sprinkler_demand_lpm: 1200,
            },
          })
        ).status
      ).toBe('PASS');
    });

    it('FP-03 density without code table → NEEDS_DATA', () => {
      const rule = getComplianceRuleById('FP-03')!;
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              sprinkler_required: 'yes',
              design_area_m2: 140,
              density_lpm_m2: 6,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('FP-04 pump flow is not sprinkler demand', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-04')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              sprinkler_required: 'yes',
              pump_flow_lpm: 2500,
              sprinkler_demand_lpm: null,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('FP-07 pump vs demand explicit condition', () => {
      const rule = getComplianceRuleById('FP-07')!;
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              sprinkler_required: 'yes',
              pump_exists: 'yes',
              pump_flow_lpm: 800,
              sprinkler_demand_lpm: 1000,
            },
          })
        ).status
      ).toBe('FAIL');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              sprinkler_required: 'yes',
              pump_exists: 'yes',
              pump_flow_lpm: 1200,
              sprinkler_demand_lpm: 1000,
            },
          })
        ).status
      ).toBe('PASS');
    });

    it('FP-08 tank required is project_design → NEEDS_DATA', () => {
      const rule = getComplianceRuleById('FP-08')!;
      const r = evaluateRule(
        rule,
        emptyCtx({
          fireProtection: {
            applicable_codes: [],
            sprinkler_required: 'yes',
            tank_exists: 'yes',
            tank_volume_m3: 80,
            tank_duration_min: 60,
            tank_required_m3: 72,
          },
        })
      );
      expect(r.status).toBe('NEEDS_DATA');
      expect(r.required_value_source).toBe('project_design');
    });

    it('FA-01 missing occupancy → not PASS; verified path PASS only with panel+detection', () => {
      const rule = getComplianceRuleById('FA-01')!;
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            egress: { metrics: [], occupant_load_total: 200 },
            fireAlarm: { provided: 'yes', verified: true },
          })
        ).status
      ).not.toBe('PASS');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, primary_occupancy_code: 'residential' },
            egress: { metrics: [], occupant_load_total: 10 },
            fireAlarm: { provided: 'yes', verified: true },
          })
        ).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, primary_occupancy_code: 'residential' },
            egress: { metrics: [], occupant_load_total: 10 },
            fireAlarm: {
              provided: 'yes',
              verified: true,
              panel: 'addressable',
              detection: 'smoke+heat',
            },
          })
        ).status
      ).toBe('PASS');
    });

    it('HYD-01 attachments alone never PASS; full fields PASS', () => {
      const rule = getComplianceRuleById('HYD-01')!;
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
            hydraulic: { has_network_data: false, attachment_count: 3 },
          })
        ).status
      ).toBe('NEEDS_DATA');
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
      expect(
        evaluateRule(
          rule,
          emptyCtx({ fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' }, hydraulic: full })
        ).status
      ).toBe('PASS');
    });
  });

  describe('override', () => {
    it('keeps original status; effectiveStatus only; PDF wording includes engineer decision', () => {
      const at = '2026-08-11T12:00:00.000Z';
      const run = runComplianceRules(
        emptyCtx({
          overrides: [
            {
              ruleId: 'EGR-06',
              reason: 'التحقق من جدول الإشغال المعتمد في الطبعة المرفقة للمشروع',
              codeReference: 'SBC 201 §1017 Table (adopted edition)',
              engineerName: 'م. خالد',
              engineerRole: 'licensed_engineer',
              overriddenAt: at,
              resultingStatus: 'PASS',
            },
          ],
        }),
        [getComplianceRuleById('EGR-06')!]
      );
      expect(run.results[0].status).toBe('NEEDS_DATA');
      expect(run.results[0].effectiveStatus).toBe('PASS');
      expect(run.matrix[0].engineerOverride).toMatch(/قرار مهندس|ليس تحققًا آليًا/);
      expect(run.matrix[0].engineerOverride).toContain(at);
    });

    it('rejects without identity / role / reason / code ref — BLOCK keeps original', () => {
      const run = runComplianceRules(
        emptyCtx({
          overrides: [
            {
              ruleId: 'OCC-01',
              reason: 'تصنيف موثّق في رخصة البناء المرفقة',
              codeReference: 'SBC 201 Chapter 3',
              overriddenAt: new Date().toISOString(),
              resultingStatus: 'PASS',
            },
          ],
        }),
        [getComplianceRuleById('OCC-01')!]
      );
      expect(run.results[0].status).toBe('NEEDS_DATA');
      expect(run.results[0].effectiveStatus).toBe('NEEDS_DATA');
      expect(run.gate).toBe('BLOCKED');
    });
  });

  describe('PR #138 audit — explicit NEEDS_DATA / Override BLOCK cases', () => {
    it('complete EGR-02 data → FAIL then PASS by exits count', () => {
      const rule = getComplianceRuleById('EGR-02')!;
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            egress: { metrics: [], occupant_load_total: 120, exits_count: 1 },
          })
        ).status
      ).toBe('FAIL');
      expect(
        evaluateRule(
          rule,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            egress: { metrics: [], occupant_load_total: 120, exits_count: 2 },
          })
        ).status
      ).toBe('PASS');
    });

    it('missing pump flow → FP-07 NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-07')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              sprinkler_required: 'yes',
              pump_exists: 'yes',
              pump_flow_lpm: null,
              sprinkler_demand_lpm: 1000,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing sprinkler demand → FP-04 and FP-07 NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-04')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              sprinkler_required: 'yes',
              pump_flow_lpm: 1200,
              sprinkler_demand_lpm: null,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(
          getComplianceRuleById('FP-07')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              sprinkler_required: 'yes',
              pump_exists: 'yes',
              pump_flow_lpm: 1200,
              sprinkler_demand_lpm: null,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing smoke control → SMK-01 NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('SMK-01')!,
          emptyCtx({ smokeControl: { required: true, status: 'unknown', ventilation_only: false } })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing hydraulic K-factor → HYD-01 NEEDS_DATA', () => {
      const fullMinusK = {
        has_network_data: false,
        attachment_count: 2,
        k_factor: null as number | null,
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
        getComplianceRuleById('HYD-01')!,
        emptyCtx({
          fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
          hydraulic: fullMinusK,
        })
      );
      expect(r.status).toBe('NEEDS_DATA');
      expect(r.message).toMatch(/k_factor|ناقص/i);
    });

    it('missing pipe data → HYD-01 NEEDS_DATA', () => {
      const r = evaluateRule(
        getComplianceRuleById('HYD-01')!,
        emptyCtx({
          fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
          hydraulic: {
            has_network_data: false,
            attachment_count: 1,
            k_factor: 5.6,
            flow_lpm: 900,
            pressure_bar: 4.5,
            required_residual_pressure_bar: 1,
            pipe_diameter_mm: null,
            pipe_length_m: null,
            elevation_m: 3,
            friction_loss_bar: 0.4,
            remote_area_m2: 140,
            node_demand_lpm: 100,
            pump_flow_lpm: 1200,
            pump_pressure_bar: 8,
            tank_volume_m3: 72,
          },
        })
      );
      expect(r.status).toBe('NEEDS_DATA');
      expect(r.message).toMatch(/pipe_|ناقص/i);
    });

    it('Override without reason → rejected; original NEEDS_DATA; gate BLOCKED', () => {
      const run = runComplianceRules(
        emptyCtx({
          overrides: [
            {
              ruleId: 'SMK-01',
              reason: '',
              codeReference: 'SBC 801 smoke',
              engineerName: 'م. أحمد',
              engineerRole: 'licensed_engineer',
              overriddenAt: new Date().toISOString(),
              resultingStatus: 'PASS',
            },
          ],
          smokeControl: { required: true, status: 'unknown' },
        }),
        [getComplianceRuleById('SMK-01')!]
      );
      expect(run.results[0].status).toBe('NEEDS_DATA');
      expect(run.results[0].effectiveStatus).toBe('NEEDS_DATA');
      expect(run.results[0].message).toMatch(/مرفوض|override_rejected|سبب/);
      expect(run.gate).toBe('BLOCKED');
    });

    it('Override without code/reference → rejected BLOCK', () => {
      const run = runComplianceRules(
        emptyCtx({
          overrides: [
            {
              ruleId: 'SMK-01',
              reason: 'تم اعتماد نظام دخان في ملحق الدفاع المدني',
              codeReference: '',
              engineerName: 'م. أحمد',
              engineerRole: 'licensed_engineer',
              overriddenAt: new Date().toISOString(),
              resultingStatus: 'PASS',
            },
          ],
          smokeControl: { required: true, status: 'unknown' },
        }),
        [getComplianceRuleById('SMK-01')!]
      );
      expect(run.results[0].effectiveStatus).toBe('NEEDS_DATA');
      expect(run.gate).toBe('BLOCKED');
    });

    it('fully documented Override → exception only on effectiveStatus', () => {
      const run = runComplianceRules(
        emptyCtx({
          overrides: [
            {
              ruleId: 'SMK-01',
              reason: 'تم اعتماد نظام دخان ميكانيكي في ملحق الدفاع المدني المرفق',
              codeReference: 'SBC 801 — Smoke Control (AHJ letter)',
              engineerName: 'م. سارة',
              engineerRole: 'licensed_engineer',
              overriddenAt: '2026-08-11T14:00:00.000Z',
              resultingStatus: 'PASS',
            },
          ],
          smokeControl: { required: true, status: 'unknown' },
        }),
        [getComplianceRuleById('SMK-01')!]
      );
      expect(run.results[0].status).toBe('NEEDS_DATA');
      expect(run.results[0].effectiveStatus).toBe('PASS');
      expect(run.results[0].message).toMatch(/ليس تحققًا آليًا|قرار مهندس/);
      expect(run.gate).toBe('ALLOW'); // single-rule run with effective PASS
    });

    it('rule IDs in COMPLIANCE_RULES match RULE_CODE_REFS 1:1', () => {
      const ids = COMPLIANCE_RULES.map((r) => r.id).sort();
      const refIds = Object.keys(RULE_CODE_REFS).sort();
      expect(ids).toEqual(refIds);
    });

    it('no absolute SBC/Civil Defense compliant wording', () => {
      const run = runProjectCompliance({
        client: baseClient(),
        data: { ...EMPTY_PROJECT_ENGINEERING_DATA },
      });
      const label = complianceStatusLabelAr(run);
      expect(label.toLowerCase()).not.toContain('sbc compliant');
      expect(label).not.toMatch(/مطابق للدفاع/);
      expect(COMPLIANCE_ASSESSMENT_DISCLAIMER_AR).toMatch(/documented rules\/data|القواعد الكودية الموثقة/);
    });

    it('FP-06 does not PASS on standpipe_required=yes without provided', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-06')!,
          emptyCtx({
            building: { ...emptyCtx().building, building_height_m: 12 },
            fireProtection: { applicable_codes: [], standpipe_required: 'yes', standpipe_provided: null },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('EGR-04/12 boolean true without evidence → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-04')!,
          emptyCtx({ egress: { metrics: [], exit_access_ok: true } })
        ).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-12')!,
          emptyCtx({ egress: { metrics: [], exit_discharge_ok: true } })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('HYD-01 zero k_factor → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('HYD-01')!,
          emptyCtx({
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
            hydraulic: {
              has_network_data: false,
              attachment_count: 0,
              k_factor: 0,
              flow_lpm: 900,
              pressure_bar: 4.5,
              required_residual_pressure_bar: 1,
              pipe_diameter_mm: 50,
              pipe_length_m: 40,
              elevation_m: 0,
              friction_loss_bar: 0.4,
              remote_area_m2: 140,
              node_demand_lpm: 100,
              pump_flow_lpm: 1200,
              pump_pressure_bar: 8,
              tank_volume_m3: 72,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('SMK-01 by_design without note → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('SMK-01')!,
          emptyCtx({ smokeControl: { required: true, status: 'by_design', note: '' } })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('OCC-08 partial special flags → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('OCC-08')!,
          emptyCtx({
            building: { ...emptyCtx().building, basement_floors: 1, underground: null, atrium: null, windowless: null },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('FP-01 verified without demand → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-01')!,
          emptyCtx({
            building: { ...emptyCtx().building, primary_occupancy_code: 'residential', building_area_m2: 500 },
            fireProtection: {
              applicable_codes: [],
              sprinkler_provided: 'yes',
              sprinkler_verified: true,
              sprinkler_system_type: 'wet',
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('FP-09 yes without location → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-09')!,
          emptyCtx({
            fireProtection: { applicable_codes: [], sprinkler_provided: 'yes' },
            fireAccess: { fdc_present: 'yes', fdc_location: null },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('EGR-03 zero capacity/load → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-03')!,
          emptyCtx({ egress: { metrics: [], exit_capacity_persons: 0, occupant_load_total: 0 } })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('FP-07 zero demand → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-07')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              sprinkler_required: 'yes',
              pump_exists: 'yes',
              pump_flow_lpm: 1000,
              sprinkler_demand_lpm: 0,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('OCC-07 null mixed flag → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('OCC-07')!,
          emptyCtx({
            building: { ...emptyCtx().building, mixed_occupancy: null },
            occupancyZones: [{ floor_name: 'G', zone_label: 'A', occupancy_code: 'business' }],
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('FP-02 loose hazard text → NEEDS_DATA; platform code PASS', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-02')!,
          emptyCtx({ fireProtection: { applicable_codes: [], hazard_class: 'خطورة' } })
        ).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(
          getComplianceRuleById('FP-02')!,
          emptyCtx({ fireProtection: { applicable_codes: [], hazard_class: 'slightly' } })
        ).status
      ).toBe('NEEDS_DATA');
      expect(
        evaluateRule(
          getComplianceRuleById('FP-02')!,
          emptyCtx({ fireProtection: { applicable_codes: [], hazard_class: 'ordinary_1' } })
        ).status
      ).toBe('PASS');
    });
  });

  it('empty project BLOCKED; assessment label not absolute مطابق', () => {
    const run = runProjectCompliance({ client: baseClient(), data: { ...EMPTY_PROJECT_ENGINEERING_DATA } });
    expect(run.gate).toBe('BLOCKED');
    expect(isFullyCompliant(run)).toBe(false);
    const label = complianceStatusLabelAr(run);
    expect(label).toMatch(/تقييم مطابقة/);
    expect(label).not.toBe('مطابق');
  });

  it('workflow gates still block', () => {
    const client = baseClient();
    const data = { ...EMPTY_PROJECT_ENGINEERING_DATA, fire_protection_design: { ...EMPTY_FIRE_PROTECTION_DESIGN } };
    for (const stage of ['technical_report', 'transmittals', 'final_report', 'completion'] as const) {
      const blockers = stageApprovalBlockers(stage, client, data);
      expect(blockers.some((b) => /المطابقة|BLOCKED|NEEDS_DATA|FAIL/i.test(b))).toBe(true);
    }
  });

  it('SMK-01 ventilation-only is not PASS', () => {
    expect(
      evaluateRule(
        getComplianceRuleById('SMK-01')!,
        emptyCtx({ smokeControl: { required: true, status: 'unknown', ventilation_only: true } })
      ).status
    ).not.toBe('PASS');
  });
});
