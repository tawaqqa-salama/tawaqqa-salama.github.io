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

  it('normalizes supporting documents (electrical, maintenance, lease, EIA)', () => {
    const docs = normalizeQuotationDocuments({
      building_permit: sampleFile('building_permit'),
      electrical_certificate: sampleFile('electrical_certificate'),
      maintenance_contract: sampleFile('maintenance_contract'),
      lease_or_deed: sampleFile('lease_or_deed'),
      eia_report: sampleFile('eia_report'),
      other: sampleFile('other'),
    });
    expect(docs.electrical_certificate?.kind).toBe('electrical_certificate');
    expect(docs.maintenance_contract?.kind).toBe('maintenance_contract');
    expect(docs.lease_or_deed?.kind).toBe('lease_or_deed');
    expect(docs.eia_report?.kind).toBe('eia_report');
    expect(docs.other?.kind).toBe('other');
    expect(validateQuotationDocumentsForIssue(docs)).toBeNull();
  });
});
