import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

describe('building permit manual-entry architecture contract', () => {
  it('keeps the OCR implementation available but removes all production UI triggers', () => {
    const upload = read('components/sales/QuotationDocumentsUpload.tsx');
    const modal = read('components/clients/ClientDetailModal.tsx');
    const extraction = read('lib/projects/building-permit-extract.ts');

    expect(upload).not.toContain('extractBuildingPermitFromFile');
    expect(upload).not.toContain('building-permit-ocr');
    expect(upload).not.toContain('onPermitExtracted');
    expect(modal).not.toContain('PermitReviewPanel');
    expect(modal).not.toContain('PermitExtractionSummary');
    expect(modal).not.toContain('commitPermitHydration');
    expect(modal).not.toContain('queuePermitReview');
    expect(extraction).toContain("supabase.functions.invoke('building-permit-ocr'");
  });

  it('does not expose OCR labels or the Next.js OCR route in the production UI', () => {
    for (const file of [
      'components/sales/QuotationDocumentsUpload.tsx',
      'components/clients/ClientDetailModal.tsx',
    ]) {
      const source = read(file);
      expect(source).not.toContain('SERVER OCR');
      expect(source).not.toContain('LOCAL OCR');
      expect(source).not.toContain('REQUIRES REVIEW');
      expect(source).not.toContain('/api/ocr/building-permit');
    }
  });

  it('keeps attachment persistence and the existing manual save flow', () => {
    const upload = read('components/sales/QuotationDocumentsUpload.tsx');
    const modal = read('components/clients/ClientDetailModal.tsx');

    expect(upload).toContain('uploadQuotationDocument(file, kind, { clientId })');
    expect(upload).toContain('onChange({ ...value, [key]: att })');
    expect(modal).toContain('<QuotationDocumentsUpload');
    expect(modal).toContain('quotation_documents: quotationDocuments');
    expect(modal).toContain('const handleSaveBasic = async () =>');
  });

  it('does not expose AI or service-role secrets to client-side files', () => {
    for (const file of [
      'components/sales/QuotationDocumentsUpload.tsx',
      'components/clients/ClientDetailModal.tsx',
      'components/clients/PermitReviewPanel.tsx',
    ]) {
      const source = read(file);
      expect(source).not.toContain('OPENAI_API_KEY');
      expect(source).not.toContain('SERVICE_ROLE');
      expect(source).not.toContain('service_role');
    }
    const server = read('supabase/functions/building-permit-ocr/index.ts');
    expect(server).toContain("Deno.env.get('OPENAI_API_KEY')");
  });
});
