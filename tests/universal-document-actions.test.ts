import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const previewDrivenDocuments = [
  'components/invoices/FinancialDocumentPrint.tsx',
  'components/invoices/TaxInvoiceTemplate.tsx',
  'components/sales/ContractPrint.tsx',
  'components/projects/BuildingPlanPrint.tsx',
  'components/projects/CdCoverLetterPrint.tsx',
  'components/projects/CompletionCertificatePrint.tsx',
  'components/projects/FieldVisitReportPrint.tsx',
  'components/projects/FinalSafetyReportPrint.tsx',
  'components/projects/SafetyDeliveryLetterPrint.tsx',
  'components/projects/SupervisionReportPrint.tsx',
  'components/projects/TechnicalReportPrint.tsx',
  'lib/projects/engineering-report-engine/print-html.ts',
  'components/compliance/ComplianceEnginePanel.tsx',
];

describe('universal generated-document actions', () => {
  it('makes the shared preview offer independent printing and real-PDF download by default', () => {
    const sheet = read('components/ui/DocumentPreviewSheet.tsx');
    expect(sheet).toContain("payload.downloadFormat !== 'html'");
    expect(sheet).toContain('downloadPdfDocument(payload.html, payload.fileName || payload.title || \'document\')');
    expect(sheet).toContain('printDocumentHtml(payload)');
    expect(sheet).toContain("'تحميل PDF'");
    expect(sheet).toMatch(/>\s*طباعة\s*<\/button>/);
  });

  it.each(previewDrivenDocuments)('%s opens the shared document preview', (path) => {
    expect(read(path)).toContain('openDocumentPreview');
  });

  it('downloads quotation/invoice/building-plan exports as PDFs rather than HTML', () => {
    for (const path of [
      'components/invoices/FinancialDocumentPrint.tsx',
      'components/invoices/TaxInvoiceTemplate.tsx',
      'components/projects/BuildingPlanPrint.tsx',
    ]) {
      const source = read(path);
      expect(source).toContain('downloadPdfDocument');
      expect(source).not.toContain('downloadHtmlDocument');
    }
  });

  it('labels the invoice prompt as separate preview and PDF download actions', () => {
    const prompt = read('components/invoices/InvoicePromptModal.tsx');
    expect(prompt).toContain('تحميل PDF');
    expect(prompt).toContain('معاينة');
    expect(prompt).not.toContain('تحميل PDF/HTML');
    expect(prompt).not.toContain('استعراض وطباعة');
  });
});
