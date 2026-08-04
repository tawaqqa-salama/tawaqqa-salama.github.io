import { describe, expect, it } from 'vitest';
import { matchPermitLocation } from '@/lib/projects/permit-location-match';
import {
  extractionToHydration,
  parseBuildingPermitText,
} from '@/lib/projects/building-permit-ocr';

describe('permit location match + hydration', () => {
  it('maps Jeddah Balady municipality/district to REGION_DATA', () => {
    const matched = matchPermitLocation({
      city: 'جدة',
      district: 'النهضة',
      municipality: 'ابحر الفرعية',
    });
    expect(matched.region).toBe('مكة المكرمة');
    expect(matched.city).toBe('جدة');
    expect(matched.district).toBe('النهضة');
  });

  it('extracts street, plot, CR, phone, land area from Balady OCR text', () => {
    const result = parseBuildingPermitText(
      `
رقم الرخصة
4100097644
اسم صاحب الرخصة
فايز صالح مسعود الحارثي
جوال رقم 0503300033
رقم السجل
1004007223
البلدية
ابحر الفرعية
الحي
النهضة
اسم الشارع
غير مسمى
القطعة
139
مساحة الارض
595.50
امانة محافظة جدة
`,
      'tesseract'
    );
    expect(result.street).toBe('غير مسمى');
    expect(result.plotNumber).toBe('139');
    expect(result.commercialRegister).toBe('1004007223');
    expect(result.phone).toBe('0503300033');
    expect(result.landAreaM2).toBe('595.50');
    expect(result.nationalAddress).toContain('النهضة');

    const hydration = extractionToHydration(result);
    expect(hydration.street).toBe('غير مسمى');
    expect(hydration.plot_number).toBe('139');
    expect(hydration.commercial_register).toBe('1004007223');
    expect(hydration.phone).toBe('0503300033');
    expect(hydration.land_area).toBe('595.50');
  });
});
