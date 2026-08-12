/**
 * SBC 201-2024 Chapter 10 Means of Egress — phase-1 rule suite.
 * No invented thresholds; CODE_TABLE_REQUIRED → BLOCKED when inputs complete.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_RULES,
  countSbc201CodeTableRequired,
  countSbc201VerifiedThresholds,
  getComplianceRuleById,
  listSbc201EgressRuleIds,
  RULE_CODE_REFS,
  SBC201_EGRESS_RULES,
  type ComplianceRuleContext,
  type ProjectCodeMapping,
  type Sbc201EgressInputs,
} from '@/lib/projects/compliance';
import { evaluateRule, runComplianceRules } from '@/lib/projects/compliance/engine';

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
    sbc201Egress: {},
  };
  return {
    ...base,
    ...partial,
    building: { ...base.building, ...(partial.building || {}) },
    egress: { ...base.egress, ...(partial.egress || {}) },
    fireProtection: { ...base.fireProtection, ...(partial.fireProtection || {}) },
    sbc201Egress: { ...(base.sbc201Egress || {}), ...(partial.sbc201Egress || {}) },
  };
}

function map2024(partial: Partial<ProjectCodeMapping> & Pick<ProjectCodeMapping, 'value' | 'source_section'>): ProjectCodeMapping {
  return {
    unit: 'm',
    source_code: 'SBC 201',
    source_edition: '2024',
    source_table: null,
    applicability: 'project-adopted SBC 201-2024 verified row for test',
    ...partial,
  };
}

const IDS = listSbc201EgressRuleIds();

describe('SBC 201-2024 Chapter 10 Means of Egress', () => {
  it('registers 28 SBC201-EGR rules with CODE_TABLE_REQUIRED thresholds only', () => {
    expect(IDS).toHaveLength(28);
    expect(IDS[0]).toBe('SBC201-EGR-001');
    expect(IDS[27]).toBe('SBC201-EGR-028');
    expect(countSbc201VerifiedThresholds()).toBe(0);
    expect(countSbc201CodeTableRequired()).toBeGreaterThanOrEqual(28);
    expect(COMPLIANCE_RULES.length).toBe(126);
    for (const id of IDS) {
      expect(getComplianceRuleById(id), id).toBeTruthy();
      expect(RULE_CODE_REFS[id]?.citation).toMatch(/SBC 201-2024/);
      expect(RULE_CODE_REFS[id]?.citation).not.toMatch(/2018/);
      const def = SBC201_EGRESS_RULES.find((r) => r.ruleId === id)!;
      expect(def.edition).toBe('2024');
      expect(def.thresholds.every((t) => t.status === 'CODE_TABLE_REQUIRED' && t.requiredValue == null)).toBe(true);
    }
  });

  it('every rule: empty inputs → NEEDS_DATA (not PASS)', () => {
    for (const id of IDS) {
      const r = evaluateRule(getComplianceRuleById(id)!, emptyCtx());
      expect(r.status, id).toBe('NEEDS_DATA');
      expect(r.status, id).not.toBe('PASS');
    }
  });

  it('missing occupancy → NEEDS_DATA for occupancy-dependent numeric rules', () => {
    for (const id of ['SBC201-EGR-002', 'SBC201-EGR-006', 'SBC201-EGR-007', 'SBC201-EGR-008', 'SBC201-EGR-009'] as const) {
      const r = evaluateRule(
        getComplianceRuleById(id)!,
        emptyCtx({
          sbc201Egress: {
            sprinklerStatus: 'sprinklered',
            storyOccupantLoad: 100,
            storyLevel: '2',
            exitsProvided: 2,
            exitAccessDoorways: 2,
            specialOccupancyCondition: 'none',
            occupantLoad: 100,
            commonPathDistance: 20,
            applicableTableSection: '1016.2',
            travelDistance: 40,
            specialCondition: 'none',
            applicableException: 'none',
            occupantLoadServed: 50,
            corridorType: 'exit_access',
            corridorClearWidth: 1.2,
            deadEndLength: 6,
            corridorConfiguration: 'standard',
          },
        })
      );
      expect(r.status, id).toBe('NEEDS_DATA');
    }
  });

  it('missing sprinkler → NEEDS_DATA', () => {
    for (const id of ['SBC201-EGR-002', 'SBC201-EGR-006', 'SBC201-EGR-007', 'SBC201-EGR-009'] as const) {
      const r = evaluateRule(
        getComplianceRuleById(id)!,
        emptyCtx({
          sbc201Egress: {
            occupancyGroup: 'B',
            occupancy: 'B',
            storyOccupantLoad: 100,
            storyLevel: '2',
            exitsProvided: 2,
            exitAccessDoorways: 2,
            specialOccupancyCondition: 'none',
            occupantLoad: 100,
            commonPathDistance: 20,
            applicableTableSection: 'x',
            travelDistance: 40,
            specialCondition: 'none',
            applicableException: 'none',
            deadEndLength: 6,
            corridorConfiguration: 'standard',
          },
        })
      );
      expect(r.status, id).toBe('NEEDS_DATA');
    }
  });

  it('missing actual measurement → NEEDS_DATA', () => {
    const r = evaluateRule(
      getComplianceRuleById('SBC201-EGR-007')!,
      emptyCtx({
        sbc201Egress: {
          occupancy: 'B',
          sprinklerStatus: 'sprinklered',
          specialCondition: 'none',
          applicableException: 'none',
        },
      })
    );
    expect(r.status).toBe('NEEDS_DATA');
  });

  it('complete inputs without verified threshold → BLOCKED + CODE_TABLE_REQUIRED', () => {
    const complete: Record<string, Sbc201EgressInputs> = {
      'SBC201-EGR-002': {
        storyOccupantLoad: 120,
        occupancyGroup: 'B',
        storyLevel: '2',
        sprinklerStatus: 'sprinklered',
        exitsProvided: 2,
        exitAccessDoorways: 2,
        specialOccupancyCondition: 'none',
      },
      'SBC201-EGR-006': {
        occupancy: 'B',
        occupantLoad: 80,
        sprinklerStatus: 'sprinklered',
        commonPathDistance: 20,
        applicableTableSection: '1016.2',
      },
      'SBC201-EGR-007': {
        occupancy: 'B',
        sprinklerStatus: 'non_sprinklered',
        travelDistance: 40,
        specialCondition: 'none',
        applicableException: 'none',
      },
      'SBC201-EGR-010': {
        doorType: 'swinging',
        clearOpeningWidth: 0.81,
        leafWidth: 0.9,
        occupantLoadServed: 40,
        egressDirection: 'direction_of_egress',
        doorLocation: 'exit_access',
      },
      'SBC201-EGR-013': {
        occupantLoadServed: 100,
        stairCount: 2,
        stairClearWidth: 1.1,
        occupancy: 'B',
        sprinklerStatus: 'sprinklered',
        applicableSectionTable: '1011',
      },
    };
    for (const [id, sbc201Egress] of Object.entries(complete)) {
      const r = evaluateRule(getComplianceRuleById(id)!, emptyCtx({ sbc201Egress }));
      expect(r.status, id).toBe('BLOCKED');
      expect(r.message, id).toMatch(/CODE_TABLE_REQUIRED/);
    }
  });

  it('rejects SBC 2018 / IBC labeled mappings', () => {
    const r = evaluateRule(
      getComplianceRuleById('SBC201-EGR-007')!,
      emptyCtx({
        sbc201Egress: {
          occupancy: 'B',
          sprinklerStatus: 'sprinklered',
          travelDistance: 40,
          specialCondition: 'none',
          applicableException: 'none',
          travelDistanceMapping: {
            value: 60,
            unit: 'm',
            source_code: 'SBC 201',
            source_edition: '2018',
            source_section: '1017',
            applicability: 'wrong edition',
          },
        },
      })
    );
    expect(r.status).toBe('BLOCKED');
  });

  describe('documented SBC 201-2024 mapping → PASS/FAIL/boundary', () => {
    it('travel distance equal boundary → PASS', () => {
      const r = evaluateRule(
        getComplianceRuleById('SBC201-EGR-007')!,
        emptyCtx({
          sbc201Egress: {
            occupancy: 'B',
            sprinklerStatus: 'sprinklered',
            travelDistance: 60,
            specialCondition: 'none',
            applicableException: 'none',
            travelDistanceMapping: map2024({ value: 60, source_section: '1017', source_table: 'Table 1017.2', unit: 'm' }),
          },
        })
      );
      expect(r.status).toBe('PASS');
      expect(r.source_edition).toBe('2024');
      expect(r.decision).toBe('PASS');
    });

    it('travel distance above limit → FAIL', () => {
      const r = evaluateRule(
        getComplianceRuleById('SBC201-EGR-007')!,
        emptyCtx({
          sbc201Egress: {
            occupancy: 'B',
            sprinklerStatus: 'sprinklered',
            travelDistance: 61,
            specialCondition: 'none',
            applicableException: 'none',
            travelDistanceMapping: map2024({ value: 60, source_section: '1017', unit: 'm' }),
          },
        })
      );
      expect(r.status).toBe('FAIL');
    });

    it('travel distance below limit → PASS', () => {
      const r = evaluateRule(
        getComplianceRuleById('SBC201-EGR-007')!,
        emptyCtx({
          sbc201Egress: {
            occupancy: 'B',
            sprinklerStatus: 'sprinklered',
            travelDistance: 59,
            specialCondition: 'none',
            applicableException: 'none',
            travelDistanceMapping: map2024({ value: 60, source_section: '1017', unit: 'm' }),
          },
        })
      );
      expect(r.status).toBe('PASS');
    });

    it('number of exits provided < required → FAIL', () => {
      const r = evaluateRule(
        getComplianceRuleById('SBC201-EGR-002')!,
        emptyCtx({
          sbc201Egress: {
            storyOccupantLoad: 200,
            occupancyGroup: 'B',
            storyLevel: '3',
            sprinklerStatus: 'sprinklered',
            exitsProvided: 1,
            exitAccessDoorways: 1,
            specialOccupancyCondition: 'none',
            numberOfExitsMapping: map2024({ value: 2, unit: 'exits', source_section: '1006', source_table: 'Table 1006.2.1' }),
          },
        })
      );
      expect(r.status).toBe('FAIL');
    });

    it('number of exits provided >= required → PASS', () => {
      const r = evaluateRule(
        getComplianceRuleById('SBC201-EGR-002')!,
        emptyCtx({
          sbc201Egress: {
            storyOccupantLoad: 200,
            occupancyGroup: 'B',
            storyLevel: '3',
            sprinklerStatus: 'sprinklered',
            exitsProvided: 2,
            exitAccessDoorways: 2,
            specialOccupancyCondition: 'none',
            numberOfExitsMapping: map2024({ value: 2, unit: 'exits', source_section: '1006' }),
          },
        })
      );
      expect(r.status).toBe('PASS');
    });

    it('door clear width uses clear opening not leaf alone', () => {
      const needs = evaluateRule(
        getComplianceRuleById('SBC201-EGR-010')!,
        emptyCtx({
          sbc201Egress: {
            doorType: 'swinging',
            leafWidth: 0.9,
            occupantLoadServed: 40,
            egressDirection: 'out',
            doorLocation: 'corridor',
            // clearOpeningWidth missing
          },
        })
      );
      expect(needs.status).toBe('NEEDS_DATA');

      const pass = evaluateRule(
        getComplianceRuleById('SBC201-EGR-010')!,
        emptyCtx({
          sbc201Egress: {
            doorType: 'swinging',
            clearOpeningWidth: 0.81,
            leafWidth: 0.9,
            occupantLoadServed: 40,
            egressDirection: 'out',
            doorLocation: 'corridor',
            doorClearMapping: map2024({ value: 0.81, unit: 'm', source_section: '1010' }),
          },
        })
      );
      expect(pass.status).toBe('PASS');
    });

    it('occupant load: factor mapping required; design < calculated → FAIL', () => {
      const blocked = evaluateRule(
        getComplianceRuleById('SBC201-EGR-001')!,
        emptyCtx({
          sbc201Egress: {
            occupancyGroup: 'B',
            spaceUse: 'office',
            grossArea: 1000,
            netArea: 900,
            applicableAreaBasis: 'gross',
            occupantLoadFactor: 10,
            designOccupantLoad: 100,
            storyOccupantLoad: 100,
            buildingOccupantLoad: 100,
            // no mapping
          },
        })
      );
      expect(blocked.status).toBe('BLOCKED');

      const fail = evaluateRule(
        getComplianceRuleById('SBC201-EGR-001')!,
        emptyCtx({
          sbc201Egress: {
            occupancyGroup: 'B',
            spaceUse: 'office',
            grossArea: 1000,
            netArea: 900,
            applicableAreaBasis: 'gross',
            designOccupantLoad: 50,
            storyOccupantLoad: 50,
            buildingOccupantLoad: 50,
            calculatedOccupantLoad: 100,
            occupantLoadFactorMapping: map2024({
              value: 10,
              unit: 'm2/person',
              source_section: '1004',
              source_table: 'Table 1004.5',
            }),
          },
        })
      );
      expect(fail.status).toBe('FAIL');

      const pass = evaluateRule(
        getComplianceRuleById('SBC201-EGR-001')!,
        emptyCtx({
          sbc201Egress: {
            occupancyGroup: 'B',
            spaceUse: 'office',
            grossArea: 1000,
            netArea: 900,
            applicableAreaBasis: 'gross',
            designOccupantLoad: 100,
            storyOccupantLoad: 100,
            buildingOccupantLoad: 100,
            calculatedOccupantLoad: 100,
            occupantLoadFactorMapping: map2024({
              value: 10,
              unit: 'm2/person',
              source_section: '1004',
              source_table: 'Table 1004.5',
            }),
          },
        })
      );
      expect(pass.status).toBe('PASS');
    });
  });

  it('NO FALSE PASS FROM FALLBACK VALUES', () => {
    // Attachment only
    expect(
      evaluateRule(
        getComplianceRuleById('SBC201-EGR-001')!,
        emptyCtx({ sbc201Egress: { attachmentCount: 5, designOccupantLoad: 100 } })
      ).status
    ).not.toBe('PASS');

    // Design load alone
    expect(
      evaluateRule(
        getComplianceRuleById('SBC201-EGR-001')!,
        emptyCtx({
          sbc201Egress: {
            occupancyGroup: 'B',
            spaceUse: 'office',
            grossArea: 500,
            applicableAreaBasis: 'gross',
            designOccupantLoad: 50,
            storyOccupantLoad: 50,
            buildingOccupantLoad: 50,
            occupantLoadFactor: 9.3, // raw number without 2024 mapping
          },
        })
      ).status
    ).toBe('BLOCKED');

    // Leaf width alone for door
    expect(
      evaluateRule(
        getComplianceRuleById('SBC201-EGR-010')!,
        emptyCtx({
          sbc201Egress: {
            doorType: 'swinging',
            leafWidth: 1.0,
            occupantLoadServed: 10,
            egressDirection: 'out',
            doorLocation: 'room',
          },
        })
      ).status
    ).toBe('NEEDS_DATA');

    // Low occupant load does not auto-allow single exit
    expect(
      evaluateRule(
        getComplianceRuleById('SBC201-EGR-003')!,
        emptyCtx({
          sbc201Egress: {
            occupancy: 'B',
            story: '1',
            occupantLoad: 10,
            sprinklerStatus: 'sprinklered',
            travelDistance: 20,
            commonPath: 10,
            applicableTableException: 'claimed_but_unverified',
          },
        })
      ).status
    ).toBe('BLOCKED');
  });

  it('run includes all 28 rules; empty project never false-PASS on SBC201-EGR', () => {
    const run = runComplianceRules(emptyCtx());
    const sbc = run.results.filter((r) => r.ruleId.startsWith('SBC201-EGR-'));
    expect(sbc).toHaveLength(28);
    expect(sbc.every((r) => r.status === 'NEEDS_DATA' || r.status === 'BLOCKED')).toBe(true);
    expect(sbc.some((r) => r.status === 'PASS')).toBe(false);
  });
});
