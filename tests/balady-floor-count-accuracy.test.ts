import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildFloorsFromAreaList,
  extractBaladyContentsFloorAreas,
  extractPlausibleAreaTokens,
  floorsCountFromFuzzyLabel,
} from '@/lib/projects/balady-permit-floors';
import { parseBuildingPermitText, extractionToHydration } from '@/lib/projects/building-permit-ocr';
import { calcFloorsCount, calcBuildingArea } from '@/lib/business/floors';

describe('balady floor count accuracy', () => {
  it('does not treat GPS decimal fragments as floor areas', () => {
    const tokens = extractPlausibleAreaTokens('2391979.9527\n429.33\n429.33\n353.69');
    expect(tokens).not.toContain(9527);
    expect(tokens).toContain(429.33);
  });

  it('caps floors to عدد الأدوار from the permit', () => {
    const text = readFileSync('tests/fixtures/balady-permit-user-pdf-ocr.txt', 'utf8');
    expect(floorsCountFromFuzzyLabel(text)).toBe(2);

    const areas = extractBaladyContentsFloorAreas(text, 2);
    expect(areas.length).toBeLessThanOrEqual(2);
    expect(areas[0]).toBeCloseTo(429.33, 1);
    expect(areas.some((a) => a > 5000)).toBe(false);

    const rows = buildFloorsFromAreaList(areas, 2);
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe('أرضي');
    expect(rows[1].label).toBe('أول');
  });

  it('without floorsCount only returns paired totals (not 7 scrap rows)', () => {
    const noisy = `
المساحات وعدد الوحدات ومواقف السيارات
محتويات المبنى
429.33
429.33
107.32
353.69
246.37
244.28
203.39
المكتب الهندسي
`;
    const areas = extractBaladyContentsFloorAreas(noisy, null);
    expect(areas).toEqual([429.33]);
    expect(buildFloorsFromAreaList(areas, null)).toHaveLength(1);
  });

  it('hydration matches permit floor count for user OCR fixture', () => {
    const text = readFileSync('tests/fixtures/balady-permit-user-pdf-ocr.txt', 'utf8');
    const result = parseBuildingPermitText(text, 'tesseract');
    const hydration = extractionToHydration(result);
    expect(result.floorsCount).toBe(2);
    expect(hydration.floor_levels).toHaveLength(2);
    expect(calcFloorsCount(hydration.floor_levels || [])).toBe(2);
    expect(calcBuildingArea(hydration.floor_levels || [])).toBeLessThan(2000);
    expect(hydration.floor_levels?.some((f) => f.area_m2 > 5000)).toBe(false);
  });
});
