import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const clientFiles = [
  'components/sales/QuotationDocumentsUpload.tsx',
  'components/clients/ClientDetailModal.tsx',
  'components/clients/PermitReviewPanel.tsx',
  'lib/projects/building-permit-extract.ts',
];

describe('building permit OCR architecture contract', () => {
  it('uses Supabase Function first and does not depend on the Next.js API route', () => {
    const extraction = read('lib/projects/building-permit-extract.ts');
    expect(extraction).toContain("supabase.functions.invoke('building-permit-ocr'");
    expect(extraction).toContain('Production order: Storage upload');
    expect(extraction).toContain('LOCAL OCR / REQUIRES REVIEW');
    expect(extraction).not.toContain("fetch('/api/ocr/building-permit'");
  });

  it('passes the uploaded Storage path and client context to the server request', () => {
    const upload = read('components/sales/QuotationDocumentsUpload.tsx');
    expect(upload).toContain('storageBucket: att.storageBucket');
    expect(upload).toContain('storagePath: att.storagePath');
    expect(upload).toContain('clientId');
  });

  it('keeps the Review gate before hydration and preserves the existing Save action', () => {
    const modal = read('components/clients/ClientDetailModal.tsx');
    const review = read('components/clients/PermitReviewPanel.tsx');
    expect(modal).toContain('queuePermitReview');
    expect(modal).toContain('<PermitReviewPanel');
    expect(modal).toContain('commitPermitHydration');
    expect(review).toContain('رفض المسودة');
    expect(review).toContain('اعتماد المحدد وتعبئة الحقول');
    expect(review).toContain('ليس VERIFIED');
    expect(modal).toContain('handleSaveBasic');
  });

  it('does not expose AI or service-role secrets to client-side files', () => {
    for (const file of clientFiles) {
      const source = read(file);
      expect(source).not.toContain('OPENAI_API_KEY');
      expect(source).not.toContain('SERVICE_ROLE');
      expect(source).not.toContain('service_role');
    }
    const server = read('supabase/functions/building-permit-ocr/index.ts');
    expect(server).toContain('Deno.env.get(\'OPENAI_API_KEY\')');
  });
});
