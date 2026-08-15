import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractionToHydration, parseBuildingPermitText } from '@/lib/projects/building-permit-ocr';
import { normalizeOcrFields, validateOcrFields } from '@/supabase/functions/_shared/building-permit-schema';

const reference = readFileSync(resolve(process.cwd(), 'tests/fixtures/permit-4100097644-reference.txt'), 'utf8');

describe('Building Permit OCR accuracy hardening', () => {
  it('matches the regression fixture without using production fallback values', () => {
    const result = parseBuildingPermitText(reference, 'pdf_text');
    expect(result.permitNumber).toBe('4100097644');
    expect(result.ownerName).toBe('فائز صالح مسعود الحارثي');
    expect(result.plotNumber).toBe('139');
    expect(result.planNumber).toBe('491/3');
    expect(result.landAreaM2).toBe('595.50');
    expect(result.licensedFloorCount).toBe(2);
    expect(result.floorsCount).toBe(2);
    expect(result.floorLevels?.map(({ label, area_m2 }) => ({ label, area_m2 }))).toEqual([
      { label: 'بدروم', area_m2: 429.33 },
      { label: 'طابق أرضي', area_m2: 353.69 },
      { label: 'طابق متكرر', area_m2: 244.28 },
      { label: 'طابق اول', area_m2: 364.79 },
      { label: 'ملحق علوي', area_m2: 181.88 },
    ]);
    expect(result.floorLevels).toHaveLength(5);
    expect(extractionToHydration(result).floors_count).toBe(2);
  });

  it('does not hydrate a non-10-digit permit number', () => {
    const hydration = extractionToHydration(parseBuildingPermitText('رقم الرخصة: 410009764', 'regex'));
    expect(hydration.building_permit_number).toBeUndefined();
  });

  it('keeps owner label pairing away from engineer and signatory names', () => {
    const result = parseBuildingPermitText(`
اسم المهندس أحمد سعد الغامدي
المكتب الهندسي مكتب التكافؤ
اسم صاحب الرخصة\nفائز  صالح مسعود الحارثي
المعتمد بتدر عبدالله إبراهيم الغامدي
`, 'pdf_text');
    expect(result.ownerName).toBe('فائز صالح مسعود الحارثي');
  });

  it('does not rewrite an uncertain owner spelling with a lexical hardcode', () => {
    const result = parseBuildingPermitText('اسم صاحب الرخصة\nقائز صالح مسعود الحارثي', 'tesseract');
    expect(result.ownerName).toBe('قائز صالح مسعود الحارثي');
  });

  it('preserves plot and plan as separate values and preserves decimal land area', () => {
    const result = parseBuildingPermitText('رقم القطعة: 139\nرقم المخطط: 491/3\nمساحة الأرض: 595.50', 'pdf_text');
    expect(result.plotNumber).toBe('139');
    expect(result.planNumber).toBe('491/3');
    expect(result.landAreaM2).toBe('595.50');
  });

  it('marks nine-digit permit values for review instead of treating them as high confidence', () => {
    const fields = normalizeOcrFields({ permitNumber: { value: '410009764', confidence: 0.99, needs_review: false } });
    expect(validateOcrFields(fields)).toContain('permitNumber must contain exactly 10 digits for this permit family');
    expect(fields.permitNumber.needs_review).toBe(true);
  });

  it('keeps licensed count independent from printed floor-level rows', () => {
    const fields = normalizeOcrFields({
      licensedFloorCount: { value: 2, confidence: 0.95, needs_review: false },
      floorLevels: {
        value: [
          { label: 'بدروم', area_m2: 429.33, activity_type: null, source: { page: 1, row_text: 'بدروم 429.33' } },
          { label: 'طابق أرضي', area_m2: 353.69, activity_type: null, source: { page: 1, row_text: 'طابق أرضي 353.69' } },
          { label: 'طابق متكرر', area_m2: 244.28, activity_type: null, source: { page: 1, row_text: 'طابق متكرر 244.28' } },
          { label: 'طابق اول', area_m2: 364.79, activity_type: null, source: { page: 1, row_text: 'طابق اول 364.79' } },
          { label: 'ملحق علوي', area_m2: 181.88, activity_type: null, source: { page: 1, row_text: 'ملحق علوي 181.88' } },
        ],
        confidence: 0.9,
        needs_review: false,
      },
    });
    expect(fields.licensedFloorCount.value).toBe(2);
    expect(fields.floorLevels.value).toHaveLength(5);
    expect(validateOcrFields(fields)).toContain('one or more floor activities are missing and require review');
    expect(fields.licensedFloorCount.needs_review).toBe(false);
  });
});
