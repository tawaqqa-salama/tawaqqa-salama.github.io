import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

describe('manual building permit workflow', () => {
  it('uploads the building permit attachment without importing, invoking, or hydrating OCR', () => {
    const upload = read('components/sales/QuotationDocumentsUpload.tsx');
    const modal = read('components/clients/ClientDetailModal.tsx');

    expect(upload).toContain('uploadQuotationDocument(file, kind, { clientId })');
    expect(upload).toContain('onChange({ ...value, [key]: att })');
    expect(upload).not.toContain('extractBuildingPermitFromFile');
    expect(upload).not.toContain('building-permit-ocr');
    expect(upload).not.toContain('onPermitExtracted');
    expect(upload).not.toContain('SERVER OCR');
    expect(upload).not.toContain('LOCAL OCR');
    expect(upload).not.toContain('REQUIRES REVIEW');

    expect(modal).not.toContain('PermitReviewPanel');
    expect(modal).not.toContain('PermitExtractionSummary');
    expect(modal).not.toContain('commitPermitHydration');
    expect(modal).not.toContain('queuePermitReview');
    expect(modal).toContain('<QuotationDocumentsUpload');
  });

  it('keeps manual permit fields in form state and the existing save action', () => {
    const modal = read('components/clients/ClientDetailModal.tsx');

    for (const fieldSetter of [
      'setBuildingPermitNumber',
      'setBuildingPermitDate',
      'setOwnerName',
      'setCity',
      'setDistrict',
      'setPlotNumber',
      'setLandArea',
      'setActivityType',
      'setFloorLevels',
    ]) {
      expect(modal).toContain(fieldSetter);
    }

    expect(modal).toContain('const handleSaveBasic = async () =>');
    expect(modal).toContain('quotation_documents: quotationDocuments');
    expect(modal).toContain('building_permit_number: buildingPermitNumber.trim()');
    expect(modal).toContain('building_permit_date: buildingPermitDate.trim()');
    expect(modal).toContain('floor_levels: floorLevels');
  });

  it('does not call OCR endpoints from the production UI while preserving the server function for history', () => {
    const uiFiles = [
      'components/sales/QuotationDocumentsUpload.tsx',
      'components/clients/ClientDetailModal.tsx',
      'components/clients/PermitReviewPanel.tsx',
    ];

    for (const file of uiFiles) {
      const source = read(file);
      expect(source).not.toContain("functions.invoke('building-permit-ocr'");
      expect(source).not.toContain('/api/ocr/building-permit');
    }

    expect(read('supabase/functions/building-permit-ocr/index.ts')).toContain('OPENAI_API_KEY');
  });
});
