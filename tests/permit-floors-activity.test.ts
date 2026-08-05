import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractionToHydration,
  parseBuildingPermitText,
} from '@/lib/projects/building-permit-ocr';
import {
  mapPermitUsageToActivityType,
  resolveFloorLevelsFromPermit,
} from '@/lib/projects/permit-floors-activity';
import { calcBuildingArea, calcFloorsCount } from '@/lib/business/floors';

describe('permit floors + activity OCR', () => {
  it('maps usage labels to activity_type', () => {
    expect(mapPermitUsageToActivityType('رخصة بناء مبنى تجاري')).toBe('commercial_complex');
    expect(mapPermitUsageToActivityType('إصدار رخصة بناء صناعية')).toBe('factory');
    expect(mapPermitUsageToActivityType('مطعم ومقهى')).toBe('restaurant');
    expect(mapPermitUsageToActivityType('عمائر سكنية')).toBe('residential_building');
  });

  it('extracts floors count, usage, and per-floor areas from clean permit text', () => {
    const text = `
إصدار رخصة بناء تجارية
رقم الرخصة
4100097644
الاستخدام
رخصة بناء مبنى تجاري
مساحة البناء: 800
عدد الأدوار: 2
محتويات المبنى
أرضي 429.33
أول 370.67
`;
    const result = parseBuildingPermitText(text, 'regex');
    expect(result.floorsCount).toBe(2);
    expect(result.usageLabel).toMatch(/تجار/);
    expect(result.activityType).toBe('commercial_complex');
    expect(result.floors?.length).toBe(2);
    expect(result.floors?.[0]?.label).toBe('أرضي');
    expect(result.floors?.[0]?.area_m2).toBe(429.33);
    expect(result.floors?.[1]?.label).toBe('أول');
    expect(result.buildingAreaM2).toBe('800');

    const hydration = extractionToHydration(result);
    expect(hydration.activity_type).toBe('commercial_complex');
    expect(hydration.floor_levels?.length).toBe(2);
    expect(calcFloorsCount(hydration.floor_levels || [])).toBe(2);
    expect(calcBuildingArea(hydration.floor_levels || [])).toBeCloseTo(800, 1);
  });

  it('builds default floor levels from count + total area when rows missing', () => {
    const levels = resolveFloorLevelsFromPermit({
      floorsCount: 1,
      buildingAreaM2: 800,
    });
    expect(levels).toHaveLength(1);
    expect(levels[0].kind).toBe('ground');
    expect(levels[0].label).toBe('أرضي');
    expect(levels[0].area_m2).toBe(800);
  });

  it('parses عدد الأدوار from sparse Balady fixture', () => {
    const fixture = readFileSync(
      join(process.cwd(), 'tests/fixtures/balady-permit-ocr-sparse.txt'),
      'utf8'
    );
    const result = parseBuildingPermitText(fixture, 'tesseract');
    expect(result.floorsCount).toBe(2);
    expect(result.usageLabel || result.activityType).toBeTruthy();
    expect(result.activityType).toBe('commercial_complex');
  });

  it('maps factory / industrial usage for tires plant style permits', () => {
    const text = `
رخصة بناء
رقم الرخصة: 4100097644
الاستخدام: مبنى صناعي / مصنع
مساحة البناء: 800
عدد الأدوار: 1
أرضي: 800 م²
`;
    const result = parseBuildingPermitText(text);
    expect(result.activityType).toBe('factory');
    expect(result.floorsCount).toBe(1);
    const hydration = extractionToHydration(result);
    expect(hydration.floor_levels?.[0]?.area_m2).toBe(800);
    expect(hydration.activity_type).toBe('factory');
  });
});
