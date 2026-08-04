import { describe, expect, it } from 'vitest';
import {
  extractionToHydration,
  hasUsefulPermitExtraction,
  normalizeArabicDigits,
  parseBuildingPermitText,
  toIsoDate,
} from '@/lib/projects/building-permit-ocr';

const SAMPLE_PERMIT = `
رخصة بناء
رقم رخصة البناء: 4301/1445
تاريخ الرخصة الهجري: 1445/05/12
تاريخ الرخصة الميلادي: 2023/11/26
اسم المالك: محمد بن عبدالله العتيبي
المدينة: الرياض
الحي: النرجس
موقع المنشأة: الرياض — النرجس
`;

describe('building permit OCR parser', () => {
  it('normalizes eastern arabic digits', () => {
    expect(normalizeArabicDigits('١٤٤٥/٠٥/١٢')).toBe('1445/05/12');
  });

  it('parses permit number, dates, owner, and location', () => {
    const result = parseBuildingPermitText(SAMPLE_PERMIT);
    expect(result.permitNumber).toBe('4301/1445');
    expect(result.permitDateHijri).toContain('1445');
    expect(toIsoDate(result.permitDateGregorian)).toBe('2023-11-26');
    expect(result.ownerName).toContain('محمد');
    expect(result.city).toBe('الرياض');
    expect(result.district).toBe('النرجس');
    expect(hasUsefulPermitExtraction(result)).toBe(true);
  });

  it('hydrates form fields from extraction', () => {
    const hydration = extractionToHydration(parseBuildingPermitText(SAMPLE_PERMIT));
    expect(hydration.building_permit_number).toBe('4301/1445');
    expect(hydration.building_permit_date).toBe('2023-11-26');
    expect(hydration.report_date).toBe('2023-11-26');
    expect(hydration.owner_name).toContain('محمد');
    expect(hydration.district).toBe('النرجس');
  });

  it('handles eastern-digit labeled permit number', () => {
    const result = parseBuildingPermitText('رقم الرخصة: ٤٣٠١٢٣٤٥');
    expect(result.permitNumber).toBe('43012345');
  });

  it('parses DD-MM-YYYY gregorian dates and OCR-spaced digits', () => {
    const result = parseBuildingPermitText(`
رقم رخصة البناء
1 4 7 0 0 1 2 3 4 5
تاريخ الرخصة الميلادي: 13-01-2024
اسم المالك: خالد العتيبي
الحي: الياسمين
`);
    expect(result.permitNumber).toBe('1470012345');
    expect(toIsoDate(result.permitDateGregorian)).toBe('2024-01-13');
    expect(result.ownerName).toContain('خالد');
  });
});
