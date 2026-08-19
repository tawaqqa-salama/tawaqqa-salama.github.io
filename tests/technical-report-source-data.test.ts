import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  EMPTY_TECHNICAL_REPORT,
  type ProjectEngineeringData,
  type TechnicalReport,
} from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import type { DesignSpaceSafetyQuantities } from '@/lib/projects/design-center/types';
import {
  applyTechnicalReportSourceOverride,
  buildTechnicalReportSourceData,
  clearTechnicalReportSourceOverride,
  patchTechnicalReportSourceOverride,
} from '@/lib/projects/technical-report-source-data';

function client(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 'client-1',
    client_code: 'C-0001',
    name: 'منشأة الاختبار',
    business_name: 'مبنى الاختبار',
    owner_name: 'المالك',
    activity_type: 'office',
    city: 'الرياض',
    district: 'الملز',
    street: 'شارع الاختبار',
    national_address: 'العنوان الوطني',
    plot_number: '42',
    land_area: 500,
    building_area: 100,
    floors_count: 2,
    project_status: 'قائم',
    ...overrides,
  };
}

function quantities(overrides: Partial<DesignSpaceSafetyQuantities> = {}): DesignSpaceSafetyQuantities {
  return {
    sprinklers: 0,
    smoke_detectors: 0,
    heat_detectors: 0,
    fire_alarm_panels: 0,
    alarm_panel_locations: [],
    signs: 0,
    emergency_lights: 0,
    emergency_exits: 0,
    alarm_bells: 0,
    emergency_stairs: 0,
    manual_extinguishers: 0,
    manual_extinguisher_type: null,
    manual_extinguisher_size: null,
    elevators: 0,
    public_facilities: 0,
    ...overrides,
  };
}

function engineeringData(overrides: Partial<ProjectEngineeringData> = {}): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: { ...EMPTY_TECHNICAL_REPORT },
    building_plan: { ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan },
    design_center: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
      space_safety: null,
    },
    ...overrides,
  };
}

function spaceSafetyData(report: TechnicalReport = { ...EMPTY_TECHNICAL_REPORT }): ProjectEngineeringData {
  return engineeringData({
    technical_report: {
      ...report,
      floor_uses: [
        {
          id: 'legacy-floor-g',
          floor_name: 'الدور الأرضي',
          floor_area_m2: '100',
          structure: 'خرسانة مسلحة',
          classification: 'TYPE I A',
          zones: [
            {
              id: 'usage-g-1',
              use_code: 'retail',
              label: 'معرض',
              area_m2: '100',
              occupancy_code: 'M',
              risk_label: 'خطر عادي',
            },
          ],
        },
      ],
    },
    building_plan: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
      building_permit_number: '4100097644',
      building_permit_date: '2025-01-15',
      occupancy_classification: 'GROUP M + B',
      building_type_code: 'TYPE I A',
      building_height_m: '18',
      high_rise_building: 'لا',
      atrium_exists: 'لا',
      underground_building: 'نعم',
      basement_floors_count: '1',
      underground_depth_m: '3.2',
      windowless_building: 'لا',
      exits_count: '4',
      stairs_count: '2',
      electrical_grounding: 'نعم',
      lightning_protection: 'نعم',
      backup_generator: 'لا',
      fire_alarm_system: 'نعم',
      sprinkler_system: 'نعم',
      special_rescue_team_required: 'لا',
    },
    design_center: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
      status: 'معتمد',
      space_safety: {
        source: 'project_engineering',
        floors: [
          {
            id: 'floor-g',
            label: 'الدور الأرضي',
            kind: 'ground',
            repeat_count: 1,
            estimated_occupants: null,
            max_travel_distance_m: null,
            areas: [
              {
                id: 'space-g-1',
                source_usage_id: 'usage-g-1',
                label: 'معرض',
                activity_type: 'retail',
                area_m2: 100,
                estimated_occupants: 10,
                max_travel_distance_m: 22,
                hazard_suggested: 'ordinary_hazard_group_1',
                hazard_approved: 'ordinary_hazard_group_1',
                suppression_suggested: ['رش آلي'],
                suppression_approved: ['رش آلي'],
                quantities: quantities({
                  sprinklers: 2,
                  smoke_detectors: 3,
                  heat_detectors: 1,
                  fire_alarm_panels: 1,
                  alarm_panel_locations: ['الحراسة'],
                  signs: 1,
                  emergency_lights: 2,
                  emergency_exits: 1,
                  alarm_bells: 1,
                  emergency_stairs: 1,
                  manual_extinguishers: 1,
                  manual_extinguisher_type: 'dry_powder_abc',
                  manual_extinguisher_size: '6 كجم',
                }),
                suggestion_overrides: { estimated_occupants: true, quantity_fields: ['sprinklers'] },
              },
            ],
          },
          {
            id: 'floor-t',
            label: 'دور نموذجي',
            kind: 'typical',
            repeat_count: 2,
            estimated_occupants: null,
            max_travel_distance_m: null,
            areas: [
              {
                id: 'space-t-1',
                label: 'مكاتب',
                activity_type: 'office',
                area_m2: 50,
                estimated_occupants: 5,
                max_travel_distance_m: 30,
                hazard_suggested: 'light_hazard',
                suppression_suggested: [],
                quantities: quantities({
                  // Explicit zero is a valid safety decision, not missing data.
                  sprinklers: 0,
                  smoke_detectors: 2,
                  emergency_exits: 1,
                  emergency_lights: 1,
                  alarm_bells: 1,
                }),
                suggestion_overrides: null,
              },
              {
                id: 'space-t-2',
                label: 'مستودع',
                activity_type: 'storage',
                area_m2: 25,
                estimated_occupants: 2,
                max_travel_distance_m: null,
                hazard_suggested: 'ordinary_hazard_group_2',
                suppression_suggested: ['رش آلي'],
                quantities: quantities({
                  sprinklers: 1,
                  smoke_detectors: 1,
                  emergency_exits: 1,
                  emergency_lights: 1,
                  manual_extinguishers: 1,
                }),
                suggestion_overrides: null,
              },
            ],
          },
        ],
      },
    },
  });
}

describe('Technical Report Phase 1 source data bridge', () => {
  it('inherits Basic Data with provenance and refreshes an upstream value when there is no override', () => {
    const data = engineeringData();
    const first = buildTechnicalReportSourceData({ client: client({ building_area: 100 }), engineeringData: data });
    const second = buildTechnicalReportSourceData({ client: client({ building_area: 250 }), engineeringData: data });

    expect(first.project.project_name.value).toBe('مبنى الاختبار');
    expect(first.project.project_name.source_stage).toBe('basic_data');
    expect(first.project.project_name.classification).toBe('AUTO_FILL_LOCKED');
    expect(first.project.building_area_m2.value).toBe(100);
    expect(second.project.building_area_m2.value).toBe(250);
    expect(second.project.building_area_m2.engineer_override).toBe(false);
  });

  it('uses Plan Information first for permit and structural fields without inventing missing values', () => {
    const bridged = buildTechnicalReportSourceData({ client: client(), engineeringData: spaceSafetyData() });

    expect(bridged.project.building_permit_number).toMatchObject({
      value: '4100097644',
      source_stage: 'plan_information',
      source_key: 'building_plan.building_permit_number',
    });
    expect(bridged.plan.construction_type.value).toBe('TYPE I A');
    expect(bridged.plan.electrical_grounding.value).toBe('نعم');
    expect(bridged.plan.civil_defense_branch).toMatchObject({ value: null, status: 'missing' });
  });

  it('maps multiple floors, multiple spaces and mixed occupancy without collapsing the hierarchy', () => {
    const bridged = buildTechnicalReportSourceData({ client: client(), engineeringData: spaceSafetyData() });

    expect(bridged.floors).toHaveLength(2);
    expect(bridged.floors[1].spaces).toHaveLength(2);
    expect(bridged.floors[0].spaces[0].occupancy).toMatchObject({ value: 'M', source_stage: 'legacy_technical_report' });
    expect(bridged.floors[0].spaces[0].hazard_classification).toMatchObject({
      value: 'ordinary_hazard_group_1',
      source_stage: 'design_center_approved',
    });
    expect(bridged.floors[1].spaces.map((space) => space.activity_use.value)).toEqual(['office', 'storage']);
    expect(bridged.floors[0].spaces[0].suggestion_overrides).toEqual({
      estimated_occupants: true,
      quantity_fields: ['sprinklers'],
    });
  });

  it('derives aggregate quantities exactly once per floor repetition and preserves an explicit zero', () => {
    const bridged = buildTechnicalReportSourceData({ client: client(), engineeringData: spaceSafetyData() });
    const zeroSprinklers = bridged.floors[1].spaces[0].quantities.sprinklers;

    expect(bridged.floors[1].base_area_m2.value).toBe(75);
    expect(bridged.floors[1].total_area_m2.value).toBe(150);
    expect(bridged.aggregates.total_floor_area_m2.value).toBe(250);
    expect(bridged.aggregates.total_occupants.value).toBe(24);
    expect(bridged.aggregates.total_exits.value).toBe(5);
    expect(bridged.aggregates.maximum_travel_distance_m.value).toBe(30);
    expect(bridged.aggregates.total_sprinklers.value).toBe(4);
    expect(bridged.aggregates.total_smoke_detectors.value).toBe(9);
    expect(bridged.aggregates.total_emergency_lights.value).toBe(6);
    expect(bridged.aggregates.total_alarm_devices.value).toBe(4);
    expect(bridged.aggregates.total_extinguishers.value).toBe(3);
    expect(zeroSprinklers).toMatchObject({ value: 0, status: 'approved_upstream' });
  });

  it('keeps missing values missing instead of coercing a missing quantity to zero', () => {
    const data = spaceSafetyData();
    const unsafeArea = data.design_center.space_safety!.floors[0].areas[0];
    unsafeArea.quantities = {} as DesignSpaceSafetyQuantities;

    const bridged = buildTechnicalReportSourceData({ client: client(), engineeringData: data });
    expect(bridged.floors[0].spaces[0].quantities.sprinklers).toMatchObject({ value: null, status: 'missing' });
  });

  it('preserves an engineer override while upstream values refresh and allows an explicit clear to inherit again', () => {
    const initial = spaceSafetyData();
    const reportWithOverride = applyTechnicalReportSourceOverride({
      report: initial.technical_report,
      fieldKey: 'project.building_area_m2',
      value: 180,
      note: 'تم اعتماد المساحة بعد مراجعة المخطط',
      approvedBy: 'مهندس السلامة',
      approvedAt: '2026-08-19T10:00:00.000Z',
    });
    const withOverride = { ...initial, technical_report: reportWithOverride };
    const bridged = buildTechnicalReportSourceData({ client: client({ building_area: 250 }), engineeringData: withOverride });
    const withoutOverride = buildTechnicalReportSourceData({
      client: client({ building_area: 250 }),
      engineeringData: { ...withOverride, technical_report: clearTechnicalReportSourceOverride(reportWithOverride, 'project.building_area_m2') },
    });

    expect(bridged.project.building_area_m2).toMatchObject({
      auto_value: 250,
      final_value: 180,
      engineer_override: true,
      status: 'engineer_override',
    });
    expect(withoutOverride.project.building_area_m2).toMatchObject({
      value: 250,
      engineer_override: false,
      source_stage: 'basic_data',
    });
  });

  it('uses legacy floor data as a compatibility fallback without mutating source stages', () => {
    const data = engineeringData({
      technical_report: {
        ...EMPTY_TECHNICAL_REPORT,
        floor_uses: [
          {
            id: 'legacy-floor',
            floor_name: 'دور قائم',
            floor_area_m2: '80',
            structure: 'خرسانة',
            classification: 'TYPE I A',
            zones: [
              { id: 'legacy-zone', use_code: 'office', label: 'مكتب', area_m2: '80', occupancy_code: 'B' },
            ],
          },
        ],
      },
    });
    const before = JSON.stringify(data);
    const bridged = buildTechnicalReportSourceData({ client: client(), engineeringData: data });

    expect(bridged.floors).toHaveLength(1);
    expect(bridged.floors[0].spaces[0].occupancy).toMatchObject({ value: 'B', source_stage: 'legacy_technical_report' });
    expect(JSON.stringify(data)).toBe(before);
  });

  it('creates a report-only override patch and never writes back to Basic Data, Space Safety or Plan Information', () => {
    const data = spaceSafetyData();
    const beforeClient = JSON.stringify(client());
    const beforePlan = JSON.stringify(data.building_plan);
    const beforeSpaceSafety = JSON.stringify(data.design_center.space_safety);
    const patchedReport = applyTechnicalReportSourceOverride({
      report: data.technical_report,
      fieldKey: 'floors.floor-g.spaces.space-g-1.occupants',
      value: 12,
    });

    expect(patchedReport.source_overrides?.['floors.floor-g.spaces.space-g-1.occupants']?.value).toBe(12);
    expect(patchedReport.floor_uses).toEqual(data.technical_report.floor_uses);
    expect(JSON.stringify(client())).toBe(beforeClient);
    expect(JSON.stringify(data.building_plan)).toBe(beforePlan);
    expect(JSON.stringify(data.design_center.space_safety)).toBe(beforeSpaceSafety);
  });

  it('produces a safe deep project patch that retains Design Center, Plan Information, attachments and legacy report fields', () => {
    const data = spaceSafetyData();
    const withAttachments = {
      ...data,
      plan_attachments: {
        engineering_drawings: [{ id: 'drawing-1', fileName: 'plan.pdf', format: 'pdf', sizeBytes: 100, uploadedAt: '2026-01-01', kind: 'engineering_drawing' as const }],
        hydraulic_calculations: [{ id: 'hyd-1', fileName: 'existing-hydraulic.pdf', format: 'pdf', sizeBytes: 100, uploadedAt: '2026-01-01', kind: 'hydraulic_calculation' as const }],
      },
    };
    const patched = patchTechnicalReportSourceOverride({
      data: withAttachments,
      fieldKey: 'project.building_area_m2',
      value: 180,
    });

    expect(patched.technical_report.source_overrides?.['project.building_area_m2']?.value).toBe(180);
    expect(patched.design_center).toEqual(withAttachments.design_center);
    expect(patched.building_plan).toEqual(withAttachments.building_plan);
    expect(patched.plan_attachments).toEqual(withAttachments.plan_attachments);
    expect(patched.technical_report.floor_uses).toEqual(withAttachments.technical_report.floor_uses);
  });
});
