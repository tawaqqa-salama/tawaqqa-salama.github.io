import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBuildingPermitText, extractionToHydration } from '@/lib/projects/building-permit-ocr';

describe('owner OCR variants', () => {
  it('fixes A>| / يافيل mangled owner from tesseract.js', () => {
    const r = parseBuildingPermitText(
      `
اسم صاحبالرخصة
A>| بن عمر بن سعيديافيل
جوال رقم0505512074
1000540318
رخصة بناء شقق مخدومة
`,
      'tesseract'
    );
    expect(r.ownerName).toBe('أحمد بن عمر بن سعيد بافيل');
    expect(r.phone).toBe('0505512074');
    expect(extractionToHydration(r).owner_name).toBe('أحمد بن عمر بن سعيد بافيل');
  });

  it('parses CLI PSM4 top-crop fixture text', () => {
    const text = readFileSync(join(__dirname, 'fixtures/balady-permit-7150-psm4.txt'), 'utf8');
    const r = parseBuildingPermitText(text, 'tesseract');
    expect(r.permitNumber).toBe('4500260099');
    expect(r.ownerName ?? '').toMatch(/أحمد/);
    expect(r.ownerName ?? '').toMatch(/بافيل|سعيد/);
    expect(r.phone).toBe('0505512074');
    // municipality should be Jeddah sub-municipality when present
    if (r.municipality) {
      expect(r.municipality).not.toMatch(/قروية/);
    }
  });
});
