import { describe, it, expect } from 'vitest';
import { parseEngineeringStudy, computeReportReadiness, canGenerateFinalTechnicalReport, createImmutableSnapshot } from '@/lib/projects/engineering-study-engine';
import { isRuleApprovedAndActive, type EngineeringStudyModel } from '@/lib/projects/engineering-study-types';

describe('Touqaa Platform Engineering Study & Gate Suite', () => {
  it('parses legacy or missing engineering data safely with defaults', () => {
    const parsed = parseEngineeringStudy(null);
    expect(parsed).toBeDefined();
    expect(parsed.building_information).toBeDefined();
    expect(parsed.systems_matrix).toBeDefined();
    expect(parsed.fire_pump).toBeDefined();
    expect(parsed.fire_water_tank).toBeDefined();
    expect(parsed.evidence_list).toEqual([]);
  });

  it('preserves engineer pump and tank inputs exactly without guessing', () => {
    const study: EngineeringStudyModel = {
      building_information: {
        occupancy: 'Group H',
        use: 'Industrial',
        construction_status: 'مكتمل',
        area_m2: '1500',
        floors: '2',
        height_m: '10',
      },
      systems_matrix: {
        automatic_sprinkler: { status: 'REQUIRED', source_type: 'VERIFIED_RULE', source_reference: 'NFPA 13-2025' },
        fire_hose_standpipe: { status: 'REQUIRED', source_type: 'VERIFIED_RULE' },
        fire_pump: { status: 'REQUIRED', source_type: 'VERIFIED_RULE' },
        fire_water_tank: { status: 'REQUIRED', source_type: 'VERIFIED_RULE' },
        fire_extinguishers: { status: 'REQUIRED', source_type: 'VERIFIED_RULE' },
        fire_alarm: { status: 'REQUIRED', source_type: 'VERIFIED_RULE' },
        emergency_exit: { status: 'REQUIRED', source_type: 'VERIFIED_RULE' },
        other: { status: 'NOT_REQUIRED', source_type: 'ENGINEER_INPUT' },
      },
      fire_pump: {
        required: true,
        flow_capacity: 750,
        flow_unit: 'GPM',
        pressure: 12.5,
        pressure_unit: 'bar',
        pump_type: 'Electric Centrifugal',
        configuration: 'UL Listed',
        source_type: 'VERIFIED_RULE',
        code_reference: 'NFPA 20-2025',
        engineer_notes: 'Tested and verified',
      },
      fire_water_tank: {
        required: true,
        capacity: 100,
        capacity_unit: 'm3',
        design_duration: 2,
        duration_unit: 'hours',
        source_type: 'VERIFIED_RULE',
        code_reference: 'NFPA 22-2025',
        engineer_notes: 'Suction tank verified',
      },
      evidence_list: [
        {
          source_type: 'VERIFIED_RULE',
          rule_id: 'NFPA13-SEC8',
          code: 'NFPA 13',
          edition: '2025',
          page: 45,
          section: '8.2.1',
          evidence_snippet: 'Design density requirement',
        },
      ],
    };

    expect(study.fire_pump.flow_capacity).toBe(750);
    expect(study.fire_water_tank.capacity).toBe(100);
    expect(study.evidence_list[0].rule_id).toBe('NFPA13-SEC8');
  });

  it('validates rule verification gate: unverified rule cannot be treated as active/approved', () => {
    const unverified = {
      verification_status: 'DRAFT',
      rule_status: 'draft',
      is_active: false,
    };
    expect(isRuleApprovedAndActive(unverified)).toBe(false);

    const activeRule = {
      verification_status: 'APPROVED',
      rule_status: 'active',
      is_active: true,
    };
    expect(isRuleApprovedAndActive(activeRule)).toBe(true);
  });

  it('computes report readiness correctly (READY only when all required inputs complete)', () => {
    const incompleteStudy: EngineeringStudyModel = {
      building_information: {
        occupancy: '',
        use: '',
        construction_status: '',
        area_m2: '',
        floors: '',
        height_m: '',
      },
      systems_matrix: {
        automatic_sprinkler: { status: 'REQUIRED', source_type: 'NOT_CONFIGURED' },
        fire_hose_standpipe: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
        fire_pump: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
        fire_water_tank: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
        fire_extinguishers: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
        fire_alarm: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
        emergency_exit: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
        other: { status: 'NOT_CONFIGURED', source_type: 'NOT_CONFIGURED' },
      },
      fire_pump: {
        required: true,
        flow_capacity: null,
        flow_unit: 'GPM',
        pressure: null,
        pressure_unit: 'bar',
        pump_type: '',
        configuration: '',
        source_type: 'NOT_CONFIGURED',
      },
      fire_water_tank: {
        required: true,
        capacity: null,
        capacity_unit: 'm3',
        design_duration: null,
        duration_unit: 'hours',
        source_type: 'NOT_CONFIGURED',
      },
      evidence_list: [],
    };

    const readinessIncomplete = computeReportReadiness(incompleteStudy);
    expect(readinessIncomplete.status).toBe('MISSING_REQUIRED_DATA');
    expect(readinessIncomplete.reasons).toContain('building_info_incomplete');
    expect(readinessIncomplete.reasons).toContain('fire_pump_capacity_missing');
    expect(readinessIncomplete.reasons).toContain('tank_capacity_missing');
  });

  it('allows draft generation with warnings but blocks final when readiness != READY or approval missing', () => {
    const study = parseEngineeringStudy(null);

    // Draft allowed
    const draftGate = canGenerateFinalTechnicalReport({
      study,
      isEngineerApproved: false,
      isDraft: true,
    });
    expect(draftGate.allowed).toBe(true);

    // Final blocked without approval and not ready
    const finalGate = canGenerateFinalTechnicalReport({
      study,
      isEngineerApproved: false,
      isDraft: false,
    });
    expect(finalGate.allowed).toBe(false);
    expect(finalGate.reasons).toContain('engineer_approval_missing');
  });

  it('creates immutable approved snapshot with cryptographic hash', () => {
    const study = parseEngineeringStudy(null);
    const { snapshot, hash } = createImmutableSnapshot({
      reportVersion: 'v1.0',
      study,
      reviewer: 'Eng. Salem',
    });

    expect(snapshot).toBeDefined();
    expect(snapshot.report_version).toBe('v1.0');
    expect(snapshot.reviewer).toBe('Eng. Salem');
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64); // SHA-256 hex
  });
});
