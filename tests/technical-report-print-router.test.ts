import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../components/projects/TechnicalReportPrint.tsx', import.meta.url),
  'utf8'
);

describe('technical report print router', () => {
  it('uses the official client-facing technical report renderer for the non-admin path', () => {
    expect(source).toContain("generateOfficialTechnicalReportDocument");
    expect(source).toContain("buildOfficialTechnicalReportHtml");
    expect(source).not.toContain("generateTechnicalReportDocument");
    expect(source).not.toContain("buildEngineeringStudyHtml");
  });

  it('does not append operational compliance diagnostics to the official PDF output', () => {
    expect(source).not.toContain("appendComplianceMatrixToReportHtml");
    expect(source).not.toContain("from '@/lib/projects/compliance'");
  });

  it('routes preview, print, and download through the same approved HTML payload', () => {
    expect(source).toContain('buildTechnicalReportDocumentPayload');
    expect(source).toContain('previewTechnicalReport');
    expect(source).toContain('printTechnicalReport');
    expect(source).toContain('downloadTechnicalReportPdf');
    expect(source).toContain('openDocumentPreview(await buildTechnicalReportDocumentPayload(params))');
    expect(source).toContain('printDocumentHtml(await buildTechnicalReportDocumentPayload(params))');
    expect(source).toContain("downloadFormat: 'pdf'");
    expect(source).toContain('downloadPdfDocument(payload.html, payload.fileName || payload.title)');
  });
});
