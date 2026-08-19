import { describe, it, expect } from 'vitest';
import { parseEngineeringStudy, computeReportReadiness, canGenerateFinalTechnicalReport } from '@/lib/projects/engineering-study-engine';
import { DEFAULT_ENGINEERING_STUDY, type EngineeringStudyModel } from '@/lib/projects/engineering-study-types';

describe('Touqaa Platform Engineering Study UI Integration Suite', () => {
  it('saves and reloads pump and tank values without data loss', () => {
    const raw = {
      building_information: {
        occupancy: 'Business',
        use: 'Offices',
        construction_status: 'تحت الإنشاء',
        area_m2: '2500',
        floors: '5',
        height_m: '20',
      },
      fire_pump: {
        required: true,
        flow_capacity: 1000,
        flow_unit: 'GPM',
        pressure: 10,
        pressure_unit: 'bar',
        pump_type: 'Diesel & Electric',
        configuration: 'UL',
        source_type: 'VERIFIED_RULE',
        code_reference: 'NFPA 20',
        engineer_notes: 'Approved set',
      },
      fire_water_tank: {
        required: true,
        capacity: 150,
        capacity_unit: 'm3',
        design_duration: 3,
        duration_unit: 'hours',
        source_type: 'VERIFIED_RULE',
        code_reference: 'NFPA 22',
        engineer_notes: 'Concrete tank',
      },
    };

    const study = parseEngineeringStudy(raw);
    expect(study.fire_pump.flow_capacity).toBe(1000);
    expect(study.fire_water_tank.capacity).toBe(150);
    expect(study.building_information.occupancy).toBe('Business');
  });

  it('saves and reloads systems matrix accurately', () => {
    const study = parseEngineeringStudy({
      systems_matrix: {
        automatic_sprinkler: {
          status: 'REQUIRED',
          source_type: 'VERIFIED_RULE',
          source_reference: 'NFPA 13',
          engineer_notes: 'Required throughout',
        },
      },
    });

    expect(study.systems_matrix.automatic_sprinkler.status).toBe('REQUIRED');
    expect(study.systems_matrix.automatic_sprinkler.source_reference).toBe('NFPA 13');
  });

  it('displays readiness correctly and blocks final generation when not ready or unapproved', () => {
    const study: EngineeringStudyModel = JSON.parse(JSON.stringify(DEFAULT_ENGINEERING_STUDY));
    const readiness = computeReportReadiness(study);
    expect(readiness.status).toBe('MISSING_REQUIRED_DATA');

    const finalGate = canGenerateFinalTechnicalReport({
      study,
      isEngineerApproved: false,
      isDraft: false,
    });
    expect(finalGate.allowed).toBe(false);
    expect(finalGate.reasons).toContain('engineer_approval_missing');
  });

  it('preserves unrelated project engineering data when parsing/merging study', () => {
    const legacyProjectData = {
      technical_report: { status: 'مكتمل' },
      engineering_study: {
        fire_pump: { required: true, flow_capacity: 500, flow_unit: 'GPM', pressure: 8, pressure_unit: 'bar', pump_type: 'Electric', configuration: '', source_type: 'ENGINEER_INPUT' },
      },
    };

    const study = parseEngineeringStudy(legacyProjectData.engineering_study);
    expect(study.fire_pump.flow_capacity).toBe(500);
    expect(legacyProjectData.technical_report.status).toBe('مكتمل');
  });
});
