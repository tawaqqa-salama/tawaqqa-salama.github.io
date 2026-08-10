import type { CompanyProfile } from '@/lib/company-profile';
import type { EngineeringStudyDocument } from '@/lib/projects/engineering-report-engine/types';
import { buildNasaimReportHtml } from '@/lib/projects/engineering-report-engine/renderer/nasaim-template';

export type ReportTemplateId = 'nasaim' | 'legacy';

export type ReportRenderInput = {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
  template?: ReportTemplateId;
};

/**
 * Presentation layer entry — pick a print template without touching
 * engineering data / rules engines.
 */
export function renderEngineeringReport(input: ReportRenderInput): string {
  const template = input.template || 'nasaim';
  if (template === 'legacy') {
    // Lazy import avoided — legacy lives in print-html for backward tests if needed.
    // Default path is Nasaim.
  }
  return buildNasaimReportHtml({
    document: input.document,
    company: input.company,
  });
}
