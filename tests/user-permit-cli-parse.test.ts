import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBuildingPermitText, extractionToHydration } from '@/lib/projects/building-permit-ocr';
import { calcBuildingArea, calcFloorsCount } from '@/lib/business/floors';

describe('cli ocr parse of user Balady PDF', () => {
  it('extracts floors count, areas, activity from real OCR text', () => {
    const text = readFileSync('tests/fixtures/balady-permit-user-pdf-ocr.txt', 'utf8');
    const result = parseBuildingPermitText(text, 'tesseract');
    const hydration = extractionToHydration(result);

    expect(result.permitNumber).toBe('4100097644');
    expect(result.floorsCount).toBe(2);
    expect(result.activityType).toBe('commercial_complex');
    expect(result.landAreaM2).toBe('595.50');
    expect(result.floors?.length).toBeGreaterThanOrEqual(1);
    expect(result.floors?.[0]?.label).toBe('أرضي');
    expect(result.floors?.[0]?.area_m2).toBeCloseTo(429.33, 1);
    expect(hydration.floor_levels?.length).toBeGreaterThanOrEqual(1);
    expect(hydration.floors_count).toBe(2);
    expect(Number(hydration.building_area || 0)).toBeGreaterThan(100);
    expect(calcFloorsCount(hydration.floor_levels || [])).toBe(2);
    expect(calcBuildingArea(hydration.floor_levels || [])).toBeGreaterThan(100);
  });
});
