import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const previewStore = readFileSync(
  new URL('../lib/print/document-preview.ts', import.meta.url),
  'utf8'
);
const previewSheet = readFileSync(
  new URL('../components/ui/DocumentPreviewSheet.tsx', import.meta.url),
  'utf8'
);
const officialTechnicalReport = readFileSync(
  new URL('../components/projects/TechnicalReportPrint.tsx', import.meta.url),
  'utf8'
);
const adminUcTechnicalReport = readFileSync(
  new URL('../lib/projects/admin-uc-report/print.ts', import.meta.url),
  'utf8'
);

describe('technical report PDF download', () => {
  it('marks both technical-report routers for real PDF download', () => {
    expect(officialTechnicalReport).toContain("downloadFormat: 'pdf'");
    expect(adminUcTechnicalReport).toContain("downloadFormat: 'pdf'");
  });

  it('creates a PDF blob through the browser PDF converter rather than renaming HTML', () => {
    expect(previewStore).toContain("import('@/lib/print/html-to-pdf')");
    expect(previewStore).toContain('htmlDocumentToPdfFile(html, fileName)');
    expect(previewStore).toContain('downloadBlob(pdf, pdf.name)');
    expect(previewStore).not.toContain("fileName.endsWith('.pdf') ? fileName : `${fileName}.html`");
  });

  it('labels the opted-in technical-report action as PDF download in the preview sheet', () => {
    expect(previewSheet).toContain("payload.downloadFormat === 'pdf'");
    expect(previewSheet).toContain('تحميل PDF');
    expect(previewSheet).toContain('downloadPdfDocument(payload.html, fileName)');
  });
});
