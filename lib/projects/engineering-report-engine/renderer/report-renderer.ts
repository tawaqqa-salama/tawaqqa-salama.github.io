import type { CompanyProfile } from '@/lib/company-profile';
import type { EngineeringStudyDocument } from '@/lib/projects/engineering-report-engine/types';
import { buildNasaimReportHtml } from '@/lib/projects/engineering-report-engine/renderer/nasaim-template';

/** `admin_uc` is rendered via lib/projects/admin-uc-report (separate document type). */
export type ReportTemplateId = 'nasaim' | 'legacy' | 'admin_uc';

export type ReportRenderInput = {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
  template?: ReportTemplateId;
};

/**
 * Presentation layer entry — pick a print template without touching
 * engineering data / rules engines.
 * Note: Administrative UC reports use `buildAdminUcReportHtml` directly.
 */
export function renderEngineeringReport(input: ReportRenderInput): string {
  const template = input.template || 'nasaim';
  if (template === 'admin_uc') {
    // Admin UC uses AdminUcDocument — call printAdminUcTechnicalReport / buildAdminUcReportHtml.
    throw new Error(
      'admin_uc template requires AdminUcDocument — use printAdminUcTechnicalReport()'
    );
  }
  if (template === 'legacy') {
    // Lazy import avoided — legacy lives in print-html for backward tests if needed.
    // Default path is Nasaim.
  }
  return buildNasaimReportHtml({
    document: input.document,
    company: input.company,
  });
}
