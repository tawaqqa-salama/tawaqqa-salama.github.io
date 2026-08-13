/**
 * Compliance Engine — rule matrix phase (SBC MoE / FAC / FP).
 * No invented thresholds; PASS only with complete documented mapping.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_RULES,
  getComplianceRuleById,
  listRuleMatrixIds,
  RULE_MATRIX,
  RULE_CODE_REFS,
  type ComplianceRuleContext,
  type ProjectCodeMapping,
} from '@/lib/projects/compliance';
import { evaluateRule } from '@/lib/projects/compliance/engine';

function emptyCtx(partial: Partial<ComplianceRuleContext> = {}): ComplianceRuleContext {
  const base: ComplianceRuleContext = {
    evaluatedAt: new Date().toISOString(),
    client: {},
    building: { special_conditions: [] },
    occupancyZones: [],
    egress: { metrics: [] },
    fireAccess: {},
    fireProtection: { applicable_codes: [] },
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
  };
}

function mapping(partial: Partial<ProjectCodeMapping> & Pick<ProjectCodeMapping, 'value'>): ProjectCodeMapping {
  return {
    unit: 'm',
    source_code: 'SBC 201',
    source_edition: '2024',
    source_section: '1017',
    source_table: 'Table 1017.2',
    ...partial,
  };
}

describe('Compliance rule matrix — no invented thresholds', () => {
  it('registers 12 matrix rules with definitions + citations', () => {
    const ids = listRuleMatrixIds();
    expect(ids).toEqual([
      'EGR-TRAVEL-DISTANCE',
      'EGR-COMMON-PATH',
      'EGR-DEAD-END',
      'EGR-CORRIDOR-WIDTH',
      'EGR-DOOR-WIDTH',
      'EGR-STAIR-WIDTH',
      'FAC-CLEARANCE',
      'FAC-TURNING',
      'FP-SPRINKLER-DENSITY',
      'FP-HOSE-ALLOWANCE',
      'FP-FIRE-WATER-TANK',
      'FP-EXTINGUISHER',
    ]);
    expect(COMPLIANCE_RULES.length).toBe(127);
    for (const id of ids) {
      expect(getComplianceRuleById(id)).toBeTruthy();
      expect(RULE_CODE_REFS[id]).toBeTruthy();
      expect(RULE_MATRIX.find((r) => r.rule_id === id)?.encoded_thresholds).toEqual([]);
    }
  });

  it('FAC matrix links existing FAC-03 / FAC-04 — no invented FAC codes', () => {
    expect(RULE_MATRIX.find((r) => r.rule_id === 'FAC-CLEARANCE')?.linked_project_fac_rules).toEqual(['FAC-03']);
    expect(RULE_MATRIX.find((r) => r.rule_id === 'FAC-TURNING')?.linked_project_fac_rules).toEqual(['FAC-04']);
    expect(RULE_CODE_REFS['FAC-03']).toBeTruthy();
    expect(RULE_CODE_REFS['FAC-04']).toBeTruthy();
  });

  describe('missing inputs → NEEDS_DATA', () => {
    it('missing occupancy → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-TRAVEL-DISTANCE')!,
          emptyCtx({
            egress: {
              metrics: [],
              sprinkler_status: 'sprinklered',
              travel_distance_m: 40,
              path_geometry_documented: true,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing sprinkler status → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-TRAVEL-DISTANCE')!,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            egress: { metrics: [], travel_distance_m: 40, path_geometry_documented: true },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing travel distance → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-TRAVEL-DISTANCE')!,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            egress: { metrics: [], sprinkler_status: 'non_sprinklered', path_geometry_documented: true },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing common path → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-COMMON-PATH')!,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            egress: { metrics: [], sprinkler_status: 'sprinklered' },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing dead-end length → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-DEAD-END')!,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            egress: { metrics: [], sprinkler_status: 'sprinklered' },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing corridor clear width → NEEDS_DATA (nominal width alone insufficient)', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-CORRIDOR-WIDTH')!,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            egress: {
              metrics: [],
              occupant_load_served: 100,
              corridor_type: 'exit_access',
              corridor_width_m: 1.5,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing door clear opening → NEEDS_DATA (leaf width alone insufficient)', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-DOOR-WIDTH')!,
          emptyCtx({
            egress: {
              metrics: [],
              occupant_load_served: 50,
              door_type: 'swinging',
              door_width_m: 0.9,
              door_egress_direction: 'direction_of_egress',
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing stair clear width → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('EGR-STAIR-WIDTH')!,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            egress: { metrics: [], occupant_load_served: 120, stairs_count: 2, stair_width_m: 1.1 },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing hazard classification → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-SPRINKLER-DENSITY')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              commodity: 'office',
              sprinkler_system_type: 'wet',
              density_lpm_m2: 6.1,
              design_area_m2: 139,
              sprinkler_count: 20,
              ceiling_installation_conditions: 'unobstructed',
            },
            hydraulic: { has_network_data: false, attachment_count: 0, k_factor: 5.6 },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing sprinkler density → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-SPRINKLER-DENSITY')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              hazard_class: 'ordinary_1',
              commodity: 'office',
              sprinkler_system_type: 'wet',
              design_area_m2: 139,
              sprinkler_count: 20,
              ceiling_installation_conditions: 'unobstructed',
            },
            hydraulic: { has_network_data: false, attachment_count: 0, k_factor: 5.6 },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing hose allowance mapping inputs → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-HOSE-ALLOWANCE')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              sprinkler_design_method: 'density_area',
              sprinkler_system_type: 'wet',
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing tank demand → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-FIRE-WATER-TANK')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              hose_allowance_lpm: 250,
              tank_duration_min: 30,
              usable_tank_volume_m3: 50,
              standpipe_required: 'no',
              other_required_fire_demand_lpm: 0,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing tank duration → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-FIRE-WATER-TANK')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              sprinkler_demand_lpm: 1000,
              hose_allowance_lpm: 250,
              usable_tank_volume_m3: 50,
              standpipe_required: 'no',
              other_required_fire_demand_lpm: 0,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing extinguisher rating → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-EXTINGUISHER')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              fire_class: 'A',
              extinguisher_hazard_level: 'light',
              extinguisher_floor_area_m2: 500,
              extinguisher_travel_distance_m: 20,
              extinguisher_count: 2,
              special_hazards: 'none',
              cooking_hazard: false,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });

    it('missing extinguisher travel distance → NEEDS_DATA', () => {
      expect(
        evaluateRule(
          getComplianceRuleById('FP-EXTINGUISHER')!,
          emptyCtx({
            fireProtection: {
              applicable_codes: [],
              fire_class: 'A',
              extinguisher_hazard_level: 'light',
              extinguisher_rating: '2-A:10-B:C',
              extinguisher_floor_area_m2: 500,
              extinguisher_count: 2,
              special_hazards: 'none',
              cooking_hazard: false,
            },
          })
        ).status
      ).toBe('NEEDS_DATA');
    });
  });

  describe('unknown code mapping → BLOCKED', () => {
    it('complete MoE inputs without encoded/project mapping → BLOCKED', () => {
      for (const id of ['EGR-TRAVEL-DISTANCE', 'EGR-COMMON-PATH', 'EGR-DEAD-END'] as const) {
        const measuredKey =
          id === 'EGR-TRAVEL-DISTANCE'
            ? 'travel_distance_m'
            : id === 'EGR-COMMON-PATH'
              ? 'common_path_m'
              : 'dead_end_m';
        const r = evaluateRule(
          getComplianceRuleById(id)!,
          emptyCtx({
            building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
            egress: {
              metrics: [],
              sprinkler_status: 'sprinklered',
              path_geometry_documented: true,
              [measuredKey]: 30,
            },
          })
        );
        expect(r.status, id).toBe('BLOCKED');
        expect(r.message).toMatch(/CODE_REFERENCE_REQUIRED/);
      }
    });

    it('hose inputs complete without table row → BLOCKED', () => {
      const r = evaluateRule(
        getComplianceRuleById('FP-HOSE-ALLOWANCE')!,
        emptyCtx({
          fireProtection: {
            applicable_codes: [],
            sprinkler_design_method: 'density_area',
            sprinkler_system_type: 'wet',
            design_area_m2: 139,
            hazard_class: 'ordinary_1',
            sprinkler_count: 20,
            nfpa_edition: '2019',
            hose_table_id: 'Table 11.2.3.1.2',
            hose_allowance_lpm: 950,
          },
        })
      );
      expect(r.status).toBe('BLOCKED');
    });

    it('FAC clearance inputs without numeric mapping → BLOCKED', () => {
      const r = evaluateRule(
        getComplianceRuleById('FAC-CLEARANCE')!,
        emptyCtx({
          fireAccess: {
            element_type: 'staging',
            required_clearance_m: 6,
            measured_clearance_m: 7,
            accessible_route_status: 'clear',
            obstruction_geometry: 'none',
          },
        })
      );
      expect(r.status).toBe('BLOCKED');
      expect(r.message).toMatch(/CODE_REFERENCE_REQUIRED/);
    });
  });

  describe('complete documented mapping → PASS / FAIL', () => {
    it('travel distance complete data → PASS', () => {
      const r = evaluateRule(
        getComplianceRuleById('EGR-TRAVEL-DISTANCE')!,
        emptyCtx({
          building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
          egress: {
            metrics: [],
            sprinkler_status: 'sprinklered',
            travel_distance_m: 45,
            path_geometry_documented: true,
            travel_distance_mapping: mapping({
              value: 60,
              source_section: '1017',
              source_table: 'Table 1017.2',
              occupancy: 'GROUP B',
              sprinkler_status: 'sprinklered',
              applicability: 'project-adopted SBC 201:2024 row for Group B sprinklered',
            }),
          },
        })
      );
      expect(r.status).toBe('PASS');
      expect(r.source_edition).toBe('2024');
      expect(r.source_section).toBe('1017');
      expect(r.decision).toBe('PASS');
    });

    it('travel distance complete data over limit → FAIL', () => {
      const r = evaluateRule(
        getComplianceRuleById('EGR-TRAVEL-DISTANCE')!,
        emptyCtx({
          building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
          egress: {
            metrics: [],
            sprinkler_status: 'non_sprinklered',
            travel_distance_m: 80,
            path_geometry_documented: true,
            travel_distance_mapping: mapping({ value: 60, sprinkler_status: 'non_sprinklered' }),
          },
        })
      );
      expect(r.status).toBe('FAIL');
    });

    it('density complete documented mapping → PASS', () => {
      const r = evaluateRule(
        getComplianceRuleById('FP-SPRINKLER-DENSITY')!,
        emptyCtx({
          fireProtection: {
            applicable_codes: [],
            hazard_class: 'ordinary_1',
            commodity: 'office',
            sprinkler_system_type: 'wet',
            density_lpm_m2: 6.1,
            design_area_m2: 139,
            sprinkler_count: 20,
            ceiling_installation_conditions: 'unobstructed',
            density_mapping: {
              value: 6.1,
              unit: 'lpm/m2',
              source_code: 'NFPA 13',
              source_edition: '2019',
              source_section: '11.2.3.1.1',
              source_table: 'Table 11.2.3.1.1',
              hazard: 'ordinary_1',
              applicability: 'project-adopted NFPA 13 OH-1 density/area row',
            },
          },
          hydraulic: { has_network_data: false, attachment_count: 0, k_factor: 5.6 },
        })
      );
      expect(r.status).toBe('PASS');
      expect(r.source_code).toBe('NFPA 13');
      expect(r.source_table).toBe('Table 11.2.3.1.1');
    });

    it('never false-PASS from fallback sprinkler assumption', () => {
      // FP package fields present but sprinkler_provided unknown and no explicit sprinkler_status
      const r = evaluateRule(
        getComplianceRuleById('EGR-TRAVEL-DISTANCE')!,
        emptyCtx({
          building: { ...emptyCtx().building, occupancy_classification: 'GROUP B' },
          fireProtection: { applicable_codes: ['SBC 801'], sprinkler_system_type: 'wet' },
          egress: {
            metrics: [],
            travel_distance_m: 40,
            path_geometry_documented: true,
            travel_distance_mapping: mapping({ value: 60 }),
          },
        })
      );
      expect(r.status).toBe('NEEDS_DATA');
      expect(r.status).not.toBe('PASS');
    });
  });
});
