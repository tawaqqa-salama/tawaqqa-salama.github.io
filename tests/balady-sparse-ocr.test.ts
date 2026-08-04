import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractionToHydration,
  parseBuildingPermitText,
} from '@/lib/projects/building-permit-ocr';
import { matchPermitLocation } from '@/lib/projects/permit-location-match';

describe('Balady sparse column OCR', () => {
  it('maps label-column then value-column layout (not next-line labels)', () => {
    const text = readFileSync(
      join(__dirname, 'fixtures/balady-permit-ocr-sparse.txt'),
      'utf8'
    );
    const r = parseBuildingPermitText(text, 'tesseract');

    expect(r.permitNumber).toBe('4100097644');
    expect(r.permitDateGregorian).toBeNull();
    expect(r.permitDateHijri).toMatch(/1442/);
    expect(r.ownerName).toBe('فايز صالح مسعود الحارثي');
    expect(r.commercialRegister).toBe('1004007223');
    expect(r.phone).toBe('0503300033');
    expect(r.municipality).toMatch(/ابحر/);
    expect(r.district).toBe('النهضة');
    expect(r.street).toBe('غير مسمى');
    expect(r.plotNumber).toBe('139');
    expect(r.landAreaM2).toBe('595.50');
    expect(r.city).toBe('جدة');

    expect(
      matchPermitLocation({
        city: r.city,
        district: r.district,
        municipality: r.municipality,
      })
    ).toEqual({ region: 'مكة المكرمة', city: 'جدة', district: 'النهضة' });

    const h = extractionToHydration(r);
    expect(h.owner_name).toBe('فايز صالح مسعود الحارثي');
    expect(h.district).toBe('النهضة');
    expect(h.street).toBe('غير مسمى');
    expect(h.plot_number).toBe('139');
    expect(h.land_area).toBe('595.50');
    expect(h.building_permit_date).toBeUndefined();
  });
});
