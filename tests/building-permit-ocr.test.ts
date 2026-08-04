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

  it('parses Balady Jeddah sparse OCR layout from scanned PDF', () => {
    const sparse = `
إصدار رخصة بناء تجارية
9إجمادي
رقم الرخصة
4100097644
التاريخ
صلاحيتها
الأول/1442
الأول/1445
اسم صاحب الرخصة
فايز صالح مسعود الحارثي
جوال رقم 0503300033
البلدية
ابحر الفرعية
الحي
النهضة
اسم الشارع
غير مسمى
`;
    const result = parseBuildingPermitText(sparse, 'tesseract');
    expect(result.permitNumber).toBe('4100097644');
    expect(result.permitDateHijri).toMatch(/1442/);
    expect(result.ownerName).toContain('فايز');
    expect(result.district).toMatch(/نهضة|النهضة/);
    expect(result.city).toBe('جدة');
    expect(hasUsefulPermitExtraction(result)).toBe(true);
  });

  it('parses Hijri date with Arabic month name', async () => {
    const { parseHijriDate } = await import('@/lib/projects/building-permit-ocr');
    expect(parseHijriDate('9/جمادي الأول/1442')).toContain('1442');
    expect(parseHijriDate('9/جمادى الأولى/1442')).toContain('جماد');
  });
});
