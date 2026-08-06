import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractEmbeddedPdfImage } from '@/lib/projects/building-permit-pdf-image';
import {
  extractBuildingPermitWithTesseract,
  extractTextWithTesseract,
} from '@/lib/projects/building-permit-tesseract';
import {
  extractionToHydration,
  parseBuildingPermitText,
} from '@/lib/projects/building-permit-ocr';

const PDF = join(__dirname, 'fixtures/balady-permit-7150.pdf');

describe('runtime OCR for Balady DCTDecode PDF', () => {
  it('extracts embedded JPEG by magic bytes', async () => {
    const bytes = new Uint8Array(readFileSync(PDF));
    const file = new File([bytes.slice()], 'permit.pdf', { type: 'application/pdf' });
    const img = await extractEmbeddedPdfImage(file);
    expect(img).not.toBeNull();
    expect(img!.size).toBeGreaterThan(100_000);
  });

  it('identity OCR returns permit number and a valid person owner', async () => {
    const bytes = new Uint8Array(readFileSync(PDF));
    const pdf = new File([bytes.slice()], 'permit.pdf', { type: 'application/pdf' });
    const img = await extractEmbeddedPdfImage(pdf);
    expect(img).not.toBeNull();
    const jpeg = new File([await img!.arrayBuffer()], 'permit.jpg', { type: 'image/jpeg' });
    const text = await extractTextWithTesseract(jpeg);
    expect(text.length).toBeGreaterThan(40);
    expect(text).toMatch(/4500260099/);

    const parsed = parseBuildingPermitText(text, 'tesseract');
    expect(parsed.permitNumber).toBe('4500260099');
    const h = extractionToHydration(parsed);
    expect(h.building_permit_number).toBe('4500260099');
    expect(h.owner_name).toBeTruthy();
    expect(h.owner_name!).toMatch(/أحمد|عمر|بافيل|سعيد/);
    expect(h.owner_name!).not.toMatch(/مكتب|هندس|رخص|بناء/);
  }, 300_000);

  it('PDF pipeline hydrates permit number', async () => {
    const bytes = new Uint8Array(readFileSync(PDF));
    const file = new File([bytes.slice()], 'permit.pdf', { type: 'application/pdf' });
    const result = await extractBuildingPermitWithTesseract(file);
    expect(result.source).toBe('tesseract');
    expect(result.permitNumber).toBe('4500260099');
    const h = extractionToHydration(result);
    expect(h.building_permit_number).toBe('4500260099');
    if (h.owner_name) {
      expect(h.owner_name).not.toMatch(/مكتب|هندس|رخص|بناء/);
    }
  }, 300_000);
});
