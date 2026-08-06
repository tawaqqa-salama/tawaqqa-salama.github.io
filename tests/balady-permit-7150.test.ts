import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractionToHydration,
  parseBuildingPermitText,
} from '@/lib/projects/building-permit-ocr';
import { extractEmbeddedPdfImage } from '@/lib/projects/building-permit-pdf-image';
import { matchPermitLocation } from '@/lib/projects/permit-location-match';

describe('Balady permit 4500260099 (أحمد بافيل)', () => {
  it('extracts DCTDecode JPEG from user PDF', async () => {
    const bytes = new Uint8Array(
      readFileSync(join(__dirname, 'fixtures/balady-permit-7150.pdf'))
    );
    const file = new File([bytes.slice()], 'رخصة-بناء.pdf', { type: 'application/pdf' });
    const blob = await extractEmbeddedPdfImage(file);
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('image/jpeg');
    expect(blob!.size).toBeGreaterThan(100_000);
  });

  it('parses sparse OCR into owner/district/plot — not office names', () => {
    const text = readFileSync(
      join(__dirname, 'fixtures/balady-permit-7150-sparse.txt'),
      'utf8'
    );
    const r = parseBuildingPermitText(text, 'tesseract');
    expect(r.permitNumber).toBe('4500260099');
    expect(r.ownerName).toBe('أحمد بن عمر بن سعيد بافيل');
    expect(r.commercialRegister).toBe('1000540318');
    expect(r.phone).toBe('0505512074');
    expect(r.district).toBe('السلامة');
    expect(r.city).toBe('جدة');
    expect(r.plotNumber).toBe('91');
    expect(r.municipality).toMatch(/جدة/);
    expect(r.permitDateHijri).toMatch(/1445/);
    expect(r.usageLabel).toMatch(/شقق/);
    expect(r.activityType).toBe('hotel');
    // Must never hydrate office stamp text into identity fields
    expect(r.ownerName).not.toMatch(/مكتب|خالد/);
    expect(r.permitNumber).not.toMatch(/مكتب/);

    const h = extractionToHydration(r);
    expect(h.owner_name).toBe('أحمد بن عمر بن سعيد بافيل');
    expect(h.district).toBe('السلامة');
    expect(h.building_permit_number).toBe('4500260099');

    expect(
      matchPermitLocation({
        city: r.city,
        district: r.district,
        municipality: r.municipality,
      })
    ).toMatchObject({ region: 'مكة المكرمة', city: 'جدة', district: 'السلامة' });
  });
});
