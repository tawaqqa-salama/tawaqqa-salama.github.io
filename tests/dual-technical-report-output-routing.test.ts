import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveTechnicalReportOutput } from '@/lib/projects/technical-report-output-router';

const printSource = readFileSync(
  resolve(process.cwd(), 'components/projects/TechnicalReportPrint.tsx'),
  'utf8'
);
const modalSource = readFileSync(
  resolve(process.cwd(), 'components/projects/ProjectReportModal.tsx'),
  'utf8'
);

describe('dual technical report output routing', () => {
  it('resolves EXISTING only to the existing output contract', () => {
    expect(resolveTechnicalReportOutput('EXISTING')).toEqual({
      kind: 'EXISTING',
      project_classification: 'EXISTING',
    });
  });

  it('resolves UNDER_CONSTRUCTION only to the under-construction output contract', () => {
    expect(resolveTechnicalReportOutput('UNDER_CONSTRUCTION')).toEqual({
      kind: 'UNDER_CONSTRUCTION',
      project_classification: 'UNDER_CONSTRUCTION',
    });
  });

  it('blocks NULL and undefined without inferring a path', () => {
    for (const value of [null, undefined]) {
      expect(resolveTechnicalReportOutput(value)).toMatchObject({
        kind: 'BLOCKED',
        project_classification: null,
        reason: 'CLASSIFICATION_REQUIRED',
        status: 'NEEDS_DATA',
        sourceField: 'clients.project_classification',
      });
    }
  });

  it('does not expose legacy selectors or forbidden status fallbacks in the output hub', () => {
    expect(printSource).toContain('resolveTechnicalReportOutput');
    expect(printSource).not.toContain('shouldUseAdminUcReport');
    expect(printSource).not.toContain("project_status ===");
    expect(printSource).not.toContain('building_status ===');
    expect(printSource).not.toContain('lifecycle_mode ===');
  });

  it('routes preview, print, and download through the same output builder', () => {
    expect(printSource).toContain('const output = await buildTechnicalReportOutput(params);');
    expect(printSource).toContain('openDocumentPreview(await buildTechnicalReportDocumentPayload(params));');
    expect(printSource).toContain('printDocumentHtml(await buildTechnicalReportDocumentPayload(params));');
    expect(printSource).toContain('downloadPdfDocument(payload.html, payload.fileName || payload.title, { pdfEngine: payload.pdfEngine })');
  });

  it('keeps three separate UI actions and blocks all of them when classification is NULL', () => {
    expect(modalSource).toContain('معاينة التقرير');
    expect(modalSource).toContain('طباعة A4');
    expect(modalSource).toContain('تحميل PDF');
    expect(modalSource).toContain("action: 'preview' | 'print' | 'download'");
    expect(modalSource).toContain("disabled={projectClassification === null}");
    expect(modalSource).toContain('classificationNeedsDataMessage');
  });
});
