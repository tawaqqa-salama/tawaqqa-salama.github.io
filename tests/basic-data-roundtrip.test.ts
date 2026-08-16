import { describe, expect, it } from 'vitest';
import { mergeProjectEngineeringData } from '@/lib/projects/merge-engineering-data';
import { getRecentPerformanceMetrics, measureRequest } from '@/lib/performance/measure-request';

describe('basic data persisted roundtrip', () => {
  it('preserves location, permit, building, and floor fields through controlled merge', () => {
    const source = {
      building_plan: {
        manual_city: 'مدينة قديمة',
        sub_municipality: 'بلدية فرعية',
        plan_number: '491/3',
        deed_number: 'D-77',
        sketch_number: 'C-12',
        northing: '12345',
        easting: '54321',
        building_permit_date: '2026-01-12',
        building_permit_date_hijri: '1447-07-23',
        permit_type: 'إنشائي',
        licensed_floor_count: 2,
        electrical_rooms_count: 1,
        building_height_m: '12.4',
        building_type_code: 'سكني',
        floor_levels: [{ label: 'أرضي', area: 353.69, usages: [{ label: 'سكني', area: 353.69, classification: 'سكني', repetition: 1 }] }],
      },
      technical_report: { building_permit_number: '4100000000', building_permit_date: '2026-01-12' },
    } as any;

    const saved = mergeProjectEngineeringData(source, {
      building_plan: { sub_municipality: 'بلدية جديدة' },
    });

    expect(saved.building_plan.sub_municipality).toBe('بلدية جديدة');
    expect(saved.building_plan.plan_number).toBe('491/3');
    expect(saved.building_plan.deed_number).toBe('D-77');
    expect(saved.building_plan.sketch_number).toBe('C-12');
    expect(saved.building_plan.northing).toBe('12345');
    expect(saved.building_plan.easting).toBe('54321');
    expect(saved.building_plan.building_permit_date).toBe('2026-01-12');
    expect(saved.building_plan.building_permit_date_hijri).toBe('1447-07-23');
    expect(saved.building_plan.permit_type).toBe('إنشائي');
    expect(saved.building_plan.licensed_floor_count).toBe(2);
    expect(saved.building_plan.electrical_rooms_count).toBe(1);
    expect((saved.building_plan as unknown as Record<string, unknown>).floor_levels).toHaveLength(1);
  });

  it('keeps all unrelated building_plan fields when one field changes', () => {
    const source = {
      building_plan: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`field_${index}`, `value-${index}`])),
    } as any;
    const saved = mergeProjectEngineeringData(source, { building_plan: { field_7: 'updated' } });
    for (let index = 0; index < 20; index += 1) {
      expect((saved.building_plan as unknown as Record<string, unknown>)[`field_${index}`]).toBe(index === 7 ? 'updated' : `value-${index}`);
    }
  });
});

describe('sales performance telemetry', () => {
  it('records row count and approximate payload size without storing response content', async () => {
    await measureRequest('test:sales:list', Promise.resolve([{ id: 'one' }, { id: 'two' }]), {
      route: '/test/sales',
      includePayloadMetrics: true,
    });
    const metric = getRecentPerformanceMetrics().at(-1);
    expect(metric?.rowCount).toBe(2);
    expect(metric?.payloadBytes).toBeGreaterThan(0);
    expect(JSON.stringify(metric)).not.toContain('one');
  });
});
