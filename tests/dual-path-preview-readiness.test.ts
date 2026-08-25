import { describe, expect, it } from 'vitest';
import {
  normalizedSpaceSafetyRepeatCount,
  spaceSafetyTotals,
} from '@/lib/projects/design-space-safety-totals';
import {
  humanizeEngineeringDisplayValue,
  userFacingSourceLabel,
} from '@/lib/projects/preview-display';
import type { DesignSpaceSafetyWorkingCopy } from '@/lib/projects/design-center/types';

function quantities(overrides: Partial<DesignSpaceSafetyWorkingCopy['floors'][number]['areas'][number]['quantities']> = {}) {
  return {
    sprinklers: 10,
    smoke_detectors: 5,
    heat_detectors: 2,
    fire_alarm_panels: 1,
    alarm_panel_locations: [],
    signs: 3,
    emergency_lights: 4,
    emergency_exits: 2,
    alarm_bells: 2,
    emergency_stairs: 1,
    manual_extinguishers: 6,
    elevators: 0,
    public_facilities: 0,
    ...overrides,
  };
}

function workingCopy(floors: DesignSpaceSafetyWorkingCopy['floors']): DesignSpaceSafetyWorkingCopy {
  return { source: 'project_engineering', floors };
}

function floor(id: string, repeat_count: number, area_m2: number, quantityOverrides = {}, max_travel_distance_m?: number) {
  return {
    id,
    label: id,
    repeat_count,
    areas: [{
      id: `${id}-area`,
      label: 'منطقة اختبار',
      area_m2,
      hazard_suggested: 'ordinary_hazard_group_1',
      suppression_suggested: [],
      quantities: quantities(quantityOverrides),
      ...(max_travel_distance_m == null ? {} : { max_travel_distance_m }),
    }],
  };
}

describe('dual-path preview readiness — Design Center repeated-floor aggregation', () => {
  it('keeps one represented floor unchanged when repeat_count is 1', () => {
    const totals = spaceSafetyTotals(workingCopy([floor('one', 1, 100)]));
    expect(totals).toMatchObject({ area_m2: 100, sprinklers: 10, smoke_detectors: 5, emergency_lights: 4, exit_signs: 3 });
  });

  it('multiplies per-floor area and safety quantities when repeat_count is 2', () => {
    const totals = spaceSafetyTotals(workingCopy([floor('two', 2, 100)]));
    expect(totals).toMatchObject({ area_m2: 200, sprinklers: 20, smoke_detectors: 10, heat_detectors: 4, fire_alarm_panels: 2, alarm_bells: 4, emergency_lights: 8, exit_signs: 6, emergency_exits: 4, manual_extinguishers: 12 });
  });

  it('supports repeat_count above 2 and mixed repeated/non-repeated floors', () => {
    const totals = spaceSafetyTotals(workingCopy([
      floor('typical', 3, 80, { sprinklers: 12, smoke_detectors: 6, emergency_lights: 5, signs: 4 }),
      floor('ground', 1, 120, { sprinklers: 8, smoke_detectors: 4, emergency_lights: 3, signs: 2 }),
    ]));
    expect(totals).toMatchObject({ area_m2: 360, sprinklers: 44, smoke_detectors: 22, emergency_lights: 18, exit_signs: 14 });
  });

  it('normalizes missing, zero, and invalid repeat counts to one per the working-copy contract', () => {
    expect(normalizedSpaceSafetyRepeatCount(undefined)).toBe(1);
    expect(normalizedSpaceSafetyRepeatCount(0)).toBe(1);
    expect(normalizedSpaceSafetyRepeatCount(-2)).toBe(1);
    expect(normalizedSpaceSafetyRepeatCount(2.5)).toBe(1);
    expect(spaceSafetyTotals(workingCopy([floor('zero', 0, 100)])).area_m2).toBe(100);
  });

  it('does not multiply a floor-level maximum travel distance', () => {
    const totals = spaceSafetyTotals(workingCopy([
      floor('typical', 4, 100, {}, 30),
      floor('ground', 1, 100, {}, 45),
    ]));
    expect(totals.max_travel_distance_m).toBe(45);
  });
});

describe('dual-path preview readiness — display-only humanization', () => {
  it('maps known canonical engineering values without mutating their canonical input', () => {
    const canonical = ['ordinary_hazard_group_1', 'dry_chemical', 'Wet Pipe', 'Upright', 'required', 'FACP Addressable'];
    const before = [...canonical];
    expect(canonical.map(humanizeEngineeringDisplayValue)).toEqual([
      'خطورة عادية — المجموعة الأولى',
      'مسحوق كيميائي جاف',
      'رطب (Wet Pipe)',
      'رشاش رأسي (Upright)',
      'مطلوب',
      'معنونة (FACP Addressable)',
    ]);
    expect(canonical).toEqual(before);
  });

  it('keeps an unmapped value readable rather than inventing a translation', () => {
    expect(humanizeEngineeringDisplayValue('Unmapped Manufacturer Term')).toBe('Unmapped Manufacturer Term');
  });

  it('formats known engineering units consistently and hides raw source paths from user-facing labels', () => {
    expect(humanizeEngineeringDisplayValue('GPM 1403')).toBe('1403 GPM');
    expect(humanizeEngineeringDisplayValue('318.656 m3')).toBe('318.656 m³');
    expect(userFacingSourceLabel('fire_protection_design.sprinkler')).toBe('التصميم الفني لأنظمة الحريق');
    expect(userFacingSourceLabel('design_center.space_safety')).toBe('مركز التصاميم — متطلبات السلامة');
    expect(userFacingSourceLabel('building_plan.electrical_grounding')).toBe('بيانات ومخططات المبنى');
  });
});
