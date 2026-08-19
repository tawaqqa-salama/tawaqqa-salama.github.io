import { describe, expect, it } from 'vitest';
import { buildBuildingPlanPrintHtml } from '@/components/projects/BuildingPlanPrint';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/company-profile';
import {
  derivePlanInfoFromSpaceSafety,
  getBuildingPlanGeneralInfo,
  mergeBuildingPlanDefaults,
  resolveBuildingPlanWithSpaceSafety,
} from '@/lib/projects/building-plan';
import { emptySafetyQuantities } from '@/lib/projects/design-center/space-safety';
import type { DesignSpaceSafetyWorkingCopy } from '@/lib/projects/design-center/types';
import type { ClientRecord } from '@/lib/types/client';

const client = {
  id: 'client-space-safety-bridge',
  client_code: 'C-SS-01',
  name: 'مالك المشروع',
  business_name: 'منشأة اختبار الربط',
  building_area: 800,
  land_area: 500,
  floors_count: 1,
} as ClientRecord;

function workingCopy(): DesignSpaceSafetyWorkingCopy {
  return {
    source: 'project_engineering',
    floors: [
      {
        id: 'floor-1',
        label: 'الدور الأرضي',
        repeat_count: 1,
        areas: [
          {
            id: 'area-1',
            label: 'صالة',
            activity_type: 'restaurant',
            area_m2: 200,
            hazard_suggested: 'ordinary_hazard_group_1',
            suppression_suggested: ['رش آلي'],
            quantities: {
              ...emptySafetyQuantities(),
              sprinklers: 4,
              smoke_detectors: 3,
              heat_detectors: 1,
              fire_alarm_panels: 1,
              alarm_bells: 2,
              emergency_exits: 2,
              emergency_stairs: 1,
              manual_extinguishers: 3,
            },
          },
        ],
      },
    ],
  };
}

describe('Building plan space-safety bridge', () => {
  it('derives only report fields that exist in the approved reference structure', () => {
    const derived = derivePlanInfoFromSpaceSafety(workingCopy());

    expect(derived).toEqual({
      hasSource: true,
      exitsCount: 2,
      stairsCount: 1,
      fireAlarmSystem: 'نعم',
      sprinklerSystem: 'نعم',
    });
  });

  it('does not activate from the Sales-seeded copy before an engineer saves project-scoped data', () => {
    const seeded = workingCopy();
    seeded.source = 'sales_basic_data';

    expect(derivePlanInfoFromSpaceSafety(seeded).hasSource).toBe(false);
  });

  it('does not invent negative system decisions when engineering data has no positive evidence', () => {
    const noSystems = workingCopy();
    noSystems.floors[0].areas[0].suppression_suggested = [];
    noSystems.floors[0].areas[0].quantities = emptySafetyQuantities();

    const derived = derivePlanInfoFromSpaceSafety(noSystems);
    expect(derived.fireAlarmSystem).toBe('');
    expect(derived.sprinklerSystem).toBe('');
  });

  it('keeps every manual plan-info decision above the derived candidate', () => {
    const manualReport = mergeBuildingPlanDefaults({
      exits_count: '9',
      stairs_count: '8',
      fire_alarm_system: 'لا',
      sprinkler_system: 'لا',
      sbc_requirements: 'متطلبات SBC المعتمدة يدويًا',
    });

    const resolved = resolveBuildingPlanWithSpaceSafety(
      manualReport,
      derivePlanInfoFromSpaceSafety(workingCopy())
    );

    expect(resolved.exits_count).toBe('9');
    expect(resolved.stairs_count).toBe('8');
    expect(resolved.fire_alarm_system).toBe('لا');
    expect(resolved.sprinkler_system).toBe('لا');
    expect(resolved.sbc_requirements).toBe('متطلبات SBC المعتمدة يدويًا');
    expect(resolved).not.toHaveProperty('derived_space_safety_occupants');
    expect(resolved).not.toHaveProperty('derived_space_safety_quantities');
  });

  it('leaves report fields unchanged when no engineering spaces have been recorded', () => {
    const report = mergeBuildingPlanDefaults({ exits_count: '4' });
    const resolved = resolveBuildingPlanWithSpaceSafety(report, derivePlanInfoFromSpaceSafety(null));

    expect(resolved).toBe(report);
    expect(resolved.exits_count).toBe('4');
  });

  it('prints the reference fields without extra safety rows or sections', () => {
    const resolved = resolveBuildingPlanWithSpaceSafety(
      mergeBuildingPlanDefaults({ status: 'مسودة' }),
      derivePlanInfoFromSpaceSafety(workingCopy())
    );
    const html = buildBuildingPlanPrintHtml(
      client,
      resolved,
      getBuildingPlanGeneralInfo(client),
      DEFAULT_COMPANY_PROFILE
    );

    expect(html).toContain('عدد المخارج');
    expect(html).toContain('>2<');
    expect(html).toContain('عدد السلالم');
    expect(html).toContain('>1<');
    expect(html).toContain('تصنيف الإشغال');
    expect(html).toContain('اسم المكتب');
    expect(html).toContain('الختم');
    expect(html).not.toContain('الشاغلون التقديريون');
    expect(html).not.toContain('مصدر البيانات');
    expect(html).not.toContain('ملخص كميات السلامة');
    expect(html).not.toContain('المرشات');
    expect(html).not.toContain('تصنيف الخطورة');
    expect(html).not.toContain('متطلبات SBC');
  });
});
