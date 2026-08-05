import { describe, expect, it } from 'vitest';
import {
  hasBuildingPermitAttached,
  normalizeQuotationDocuments,
  validateQuotationDocumentsForIssue,
} from '@/lib/business/quotation-documents';
import type { QuotationDocumentFile } from '@/lib/types/quotation-documents';

function sampleFile(kind: QuotationDocumentFile['kind']): QuotationDocumentFile {
  return {
    id: `test-${kind}`,
    fileName: `${kind}.pdf`,
    format: 'pdf',
    sizeBytes: 1024,
    uploadedAt: '2026-08-04T00:00:00.000Z',
    kind,
  };
}

describe('quotation documents gate', () => {
  it('normalizes empty / partial payloads', () => {
    expect(normalizeQuotationDocuments(null).building_permit).toBeNull();
    expect(normalizeQuotationDocuments({ owner_id: sampleFile('owner_id') }).owner_id?.fileName).toBe(
      'owner_id.pdf'
    );
  });

  it('requires building permit before issuing quotation', () => {
    expect(validateQuotationDocumentsForIssue(normalizeQuotationDocuments(null))).toMatch(/رخصة البناء/);
    expect(hasBuildingPermitAttached(normalizeQuotationDocuments(null))).toBe(false);

    const withPermit = normalizeQuotationDocuments({
      building_permit: sampleFile('building_permit'),
    });
    expect(validateQuotationDocumentsForIssue(withPermit)).toBeNull();
    expect(hasBuildingPermitAttached(withPermit)).toBe(true);
  });

  it('treats owner id and commercial register as optional', () => {
    const onlyPermit = normalizeQuotationDocuments({
      building_permit: sampleFile('building_permit'),
    });
    expect(validateQuotationDocumentsForIssue(onlyPermit)).toBeNull();

    const withOptional = normalizeQuotationDocuments({
      building_permit: sampleFile('building_permit'),
      owner_id: sampleFile('owner_id'),
      commercial_register: sampleFile('commercial_register'),
    });
    expect(validateQuotationDocumentsForIssue(withOptional)).toBeNull();
    expect(withOptional.owner_id?.kind).toBe('owner_id');
    expect(withOptional.commercial_register?.kind).toBe('commercial_register');
  });
});
