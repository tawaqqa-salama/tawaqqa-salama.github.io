import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeDesignCenterDefaults } from '@/lib/projects/design-center/state';
import {
  createProjectArea,
  createProjectFloor,
  emptySafetyQuantities,
  floorSafetyTotals,
  nonNegativeInteger,
  normalizeSpaceSafetyWorkingCopy,
  projectSafetyTotals,
  safetyTotals,
  seedSpaceSafetyFromClient,
  suggestAreaSafety,
} from '@/lib/projects/design-center/space-safety';
import { DESIGN_CENTER_TABS } from '@/lib/projects/design-center/types';
import type { ClientRecord } from '@/lib/types/client';

function client(): ClientRecord {
  return {
    id: 'client-space-safety',
    name: 'عميل اختبار',
    client_code: 'C-SPACE',
    activity_type: 'office',
    floors_count: 2,
    building_area: 300,
    floor_levels: [
      {
        id: 'floor-ground',
        label: 'الدور الأرضي',
        kind: 'ground',
        area_m2: 180,
        repeat_count: 1,
        usages: [
          { id: 'usage-shop', label: 'معرض', activity_type: 'retail', area_m2: 120 },
          { id: 'usage-office', label: 'مكتب إداري', activity_type: 'office', area_m2: 60 },
        ],
      },
      {
        id: 'floor-first',
        label: 'الدور الأول',
        kind: 'first',
        area_m2: 120,
        repeat_count: 1,
        usages: [{ id: 'usage-first', label: 'مكاتب', activity_type: 'office', area_m2: 120 }],
      },
    ],
  };
}

describe('Design Center space and safety working copy', () => {
  it('inherits floors and areas once with stable Sales source identity', () => {
    const copy = seedSpaceSafetyFromClient(client());
    expect(copy.source).toBe('sales_basic_data');
    expect(copy.floors.map((floor) => floor.source_floor_id)).toEqual(['floor-ground', 'floor-first']);
    expect(copy.floors[0].areas.map((area) => area.source_usage_id)).toEqual([
      'usage-shop',
      'usage-office',
    ]);
    expect(copy.floors[0].areas.map((area) => area.area_m2)).toEqual([120, 60]);
  });

  it('keeps the project working copy independent from later Sales mutations', () => {
    const sales = client();
    const copy = seedSpaceSafetyFromClient(sales);
    copy.floors[0].areas[0].label = 'معرض معدل هندسيًا';
    copy.floors[0].areas[0].quantities.sprinklers = 12;
    expect(sales.floor_levels?.[0].usages?.[0].label).toBe('معرض');
    expect(sales.floor_levels?.[0].usages?.[0].area_m2).toBe(120);

    const reload = seedSpaceSafetyFromClient({ ...sales, floor_levels: [] }, copy);
    expect(reload.floors[0].areas[0].label).toBe('معرض معدل هندسيًا');
    expect(reload.floors[0].areas[0].quantities.sprinklers).toBe(12);
  });

  it('preserves hazards, systems, quantities and panel locations through normalization/reload', () => {
    const seeded = seedSpaceSafetyFromClient(client());
    seeded.floors[0].estimated_occupants = 120;
    seeded.floors[0].max_travel_distance_m = 34.5;
    seeded.floors[0].areas[0].estimated_occupants = 45;
    seeded.floors[0].areas[0].max_travel_distance_m = 27.5;
    seeded.floors[0].areas[0].hazard_approved = 'خطورة متوسطة';
    seeded.floors[0].areas[0].suppression_approved = ['رش آلي', 'طفايات'];
    seeded.floors[0].areas[0].quantities = {
      ...emptySafetyQuantities(),
      sprinklers: 4,
      smoke_detectors: 3,
      fire_alarm_panels: 2,
      alarm_panel_locations: ['المدخل الرئيسي', 'غرفة الأمن'],
      signs: 5,
      emergency_lights: 6,
      emergency_exits: 2,
      alarm_bells: 2,
      emergency_stairs: 1,
      elevators: 3,
      public_facilities: 2,
    };

    const normalized = normalizeSpaceSafetyWorkingCopy(seeded);
    const reloaded = mergeDesignCenterDefaults({ space_safety: normalized }).space_safety;
    expect(reloaded?.floors[0]).toMatchObject({
      estimated_occupants: 120,
      max_travel_distance_m: 34.5,
    });
    expect(reloaded?.floors[0].areas[0]).toMatchObject({
      estimated_occupants: 45,
      max_travel_distance_m: 27.5,
      hazard_approved: 'خطورة متوسطة',
      suppression_approved: ['رش آلي', 'طفايات'],
      quantities: {
        sprinklers: 4,
        smoke_detectors: 3,
        fire_alarm_panels: 2,
        alarm_panel_locations: ['المدخل الرئيسي', 'غرفة الأمن'],
        elevators: 3,
        public_facilities: 2,
      },
    });
  });

  it('clamps all safety quantities to non-negative integers', () => {
    expect(nonNegativeInteger(-4)).toBe(0);
    expect(nonNegativeInteger('3.9')).toBe(3);
    expect(nonNegativeInteger('not-a-number')).toBe(0);

    const normalized = normalizeSpaceSafetyWorkingCopy({
      source: 'project_engineering',
      floors: [
        {
          id: 'f-1',
          label: 'أرضي',
          repeat_count: 1,
          areas: [
            {
              id: 'a-1',
              label: 'معرض',
              area_m2: -20,
              hazard_suggested: 'منخفضة',
              suppression_suggested: [],
              quantities: { ...emptySafetyQuantities(), sprinklers: -1, alarm_bells: 2.8 },
            },
          ],
        },
      ],
    });
    expect(normalized?.floors[0].areas[0].area_m2).toBe(0);
    expect(normalized?.floors[0].areas[0].quantities.sprinklers).toBe(0);
    expect(normalized?.floors[0].areas[0].quantities.alarm_bells).toBe(2);
  });

  it('creates and removes project-only floors and areas without touching Sales identity', () => {
    const sales = client();
    const copy = seedSpaceSafetyFromClient(sales);
    const addedFloor = createProjectFloor();
    const addedArea = createProjectArea();
    addedFloor.areas.push(addedArea);
    const withProjectItems = { ...copy, floors: [...copy.floors, addedFloor] };
    const withoutProjectArea = {
      ...withProjectItems,
      floors: withProjectItems.floors.map((floor) =>
        floor.id === addedFloor.id
          ? { ...floor, areas: floor.areas.filter((area) => area.id !== addedArea.id) }
          : floor
      ),
    };
    const withoutProjectFloor = {
      ...withoutProjectArea,
      floors: withoutProjectArea.floors.filter((floor) => floor.id !== addedFloor.id),
    };
    expect(withoutProjectFloor.floors.map((floor) => floor.source_floor_id)).toEqual([
      'floor-ground',
      'floor-first',
    ]);
    expect(sales.floor_levels).toHaveLength(2);
  });

  it('updates advisory risk and suppression suggestions from activity without replacing engineer approval', () => {
    const copy = seedSpaceSafetyFromClient(client());
    const area = copy.floors[0].areas[0];
    const suggestion = suggestAreaSafety({ ...area, activity_type: 'office' });
    expect(suggestion.hazard_suggested).toBeTruthy();
    expect(suggestion.suppression_suggested).toBeInstanceOf(Array);
    area.hazard_approved = 'معتمد يدويًا';
    expect(area.hazard_approved).toBe('معتمد يدويًا');
  });

  it('calculates floor and project totals from areas without array-index identity', () => {
    const copy = seedSpaceSafetyFromClient(client());
    copy.floors[0].areas[0].estimated_occupants = 80;
    copy.floors[0].areas[0].max_travel_distance_m = 25;
    copy.floors[0].areas[1].estimated_occupants = 20;
    copy.floors[0].areas[1].max_travel_distance_m = 18;
    copy.floors[1].areas[0].estimated_occupants = 70;
    copy.floors[1].areas[0].max_travel_distance_m = 30;
    copy.floors[1].estimated_occupants = 90;
    copy.floors[1].max_travel_distance_m = 28;
    copy.floors[0].areas[0].quantities.sprinklers = 4;
    copy.floors[0].areas[1].quantities.sprinklers = 2;
    copy.floors[1].areas[0].quantities.sprinklers = 3;
    copy.floors[0].areas[0].quantities.elevators = 1;
    copy.floors[1].areas[0].quantities.elevators = 2;
    copy.floors[0].areas[0].quantities.public_facilities = 1;
    copy.floors[1].areas[0].quantities.public_facilities = 3;
    copy.floors[0].areas[0].quantities.alarm_panel_locations = ['المدخل'];
    copy.floors[1].areas[0].quantities.alarm_panel_locations = ['غرفة الأمن'];

    expect(safetyTotals(copy.floors[0].areas)).toMatchObject({
      total_area_m2: 180,
      areas_count: 2,
      sprinklers: 6,
      estimated_occupants: 100,
      max_travel_distance_m: 25,
    });
    expect(floorSafetyTotals(copy.floors[1])).toMatchObject({
      estimated_occupants: 90,
      max_travel_distance_m: 28,
    });
    expect(projectSafetyTotals(copy)).toMatchObject({
      total_area_m2: 300,
      areas_count: 3,
      sprinklers: 9,
      elevators: 3,
      public_facilities: 4,
      alarm_panel_locations: ['المدخل', 'غرفة الأمن'],
      estimated_occupants: 190,
      max_travel_distance_m: 28,
    });
  });

  it('preserves existing drawing versions when Design Center gains the space-safety copy', () => {
    const design = mergeDesignCenterDefaults({
      sheets: [
        {
          id: 'sheet-1',
          title: 'مخطط قائم',
          format: 'pdf',
          activeVersionId: 'v-1',
          createdAt: '2026-08-18T00:00:00.000Z',
          versions: [
            {
              id: 'v-1',
              version: 1,
              label: 'v1',
              uploadedAt: '2026-08-18T00:00:00.000Z',
              file: { id: 'f-1', fileName: 'existing.pdf', format: 'pdf', sizeBytes: 100, uploadedAt: '2026-08-18T00:00:00.000Z', kind: 'engineering_drawing' },
            },
          ],
        },
      ],
      space_safety: seedSpaceSafetyFromClient(client()),
    });
    expect(design.sheets[0].versions[0].file.fileName).toBe('existing.pdf');
    expect(design.space_safety?.floors).toHaveLength(2);
  });

  it('keeps drawings and calculations second with a final unified hydraulic upload card', () => {
    expect(DESIGN_CENTER_TABS[0].id).toBe('space_safety');
    expect(DESIGN_CENTER_TABS[1]).toMatchObject({
      id: 'drawings',
      label_ar: 'المخططات والحسابات',
      label_en: 'Drawings & Calculations',
    });
    const section = readFileSync(
      resolve(process.cwd(), 'components/projects/DesignCenterSection.tsx'),
      'utf8'
    );
    expect(section).not.toContain("['pdf', 'رفع PDF'");
    expect(section).toContain("tab === 'space_safety'");
    expect(section).toContain("tab === 'drawings'");
    expect(section).toContain("'المخططات والحسابات'");
    expect(section).not.toContain('PlanAttachmentsUpload');
    expect(section).toContain('planAttachments={data.plan_attachments}');
    expect(section).toContain('onPlanAttachmentsChange');
    expect(section).not.toContain('إدارة إصدارات المخططات');
    expect(section).not.toContain('مقارنة الإصدارات');
    expect(section).not.toContain('عرض المخطط داخل المتصفح');
    const attachments = readFileSync(
      resolve(process.cwd(), 'components/projects/PlanAttachmentsUpload.tsx'),
      'utf8'
    );
    expect(attachments).toContain('إرفاق ملف الحسابات الهيدروليكية');
    expect(attachments).toContain("variant?: 'standard' | 'blueprint-card'");
    const hydraulicCardStart = attachments.indexOf('function HydraulicCalculationsCard');
    expect(hydraulicCardStart).toBeGreaterThan(-1);
    expect(attachments.indexOf('إرفاق ملف الحسابات الهيدروليكية (PDF / CALC)', hydraulicCardStart)).toBeGreaterThan(hydraulicCardStart);
    expect(attachments).toContain('اسحب الملف أو اختر للرفع');
    expect(attachments).toContain("'hydraulic_calculation', 'hydraulic_calculations'");
    const blueprints = readFileSync(
      resolve(process.cwd(), 'components/projects/SafetyBlueprintsUpload.tsx'),
      'utf8'
    );
    expect(blueprints).toContain("sections={['hydraulic_calculations']}");
    expect(blueprints).toContain('variant="blueprint-card"');
    expect(blueprints.indexOf('variant="blueprint-card"')).toBeGreaterThan(blueprints.indexOf('{SLOTS.map'));
    expect(blueprints).not.toContain('أقصى مسافة سفر (م) — لفحص Life Safety');
    expect(blueprints).not.toContain('عدد الشاغلين التقديري</span>');
    const spaceSection = readFileSync(
      resolve(process.cwd(), 'components/projects/DesignSpaceSafetySection.tsx'),
      'utf8'
    );
    expect(spaceSection).toContain('عدد الشاغلين التقديري للدور');
    expect(spaceSection).toContain('أقصى مسافة سفر للدور');
    expect(spaceSection).toContain('عدد الشاغلين التقديري');
    expect(spaceSection).toContain('أقصى مسافة سفر (م)');
    expect(spaceSection).toContain('floorSafetyTotals');
  });
});
