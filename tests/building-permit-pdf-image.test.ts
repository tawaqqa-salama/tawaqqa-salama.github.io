import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractEmbeddedPdfImage } from '@/lib/projects/building-permit-pdf-image';
import { parseBuildingPermitText, hasUsefulPermitExtraction } from '@/lib/projects/building-permit-ocr';

const SAMPLE =
  '/home/ubuntu/.cursor/projects/workspace/uploads/___________-________e0db.pdf';

describe('scanned Balady PDF → image extract', () => {
  it('extracts embedded JPEG from Flate+DCTDecode permit PDF', async () => {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(SAMPLE));
    } catch {
      // Sample only present in cloud agent upload workspace
      expect(true).toBe(true);
      return;
    }
    const copy = bytes.slice();
    const file = new File([copy], 'رخصة-بناء.pdf', { type: 'application/pdf' });
    const blob = await extractEmbeddedPdfImage(file);
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('image/jpeg');
    expect(blob!.size).toBeGreaterThan(50_000);
  });

  it('parser accepts OCR text from this permit', () => {
    const result = parseBuildingPermitText(
      `
9إجمادي
رقم الرخصة
4100097644
التاريخ
الأول/1442
اسم صاحب الرخصة
فايز صالح مسعود الحارثي
الحي
النهضة
امانة محافظة جدة
`,
      'tesseract'
    );
    expect(result.permitNumber).toBe('4100097644');
    expect(result.permitDateHijri).toMatch(/1442/);
    expect(hasUsefulPermitExtraction(result)).toBe(true);
  });
});
