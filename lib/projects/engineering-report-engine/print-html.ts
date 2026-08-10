import type { CompanyProfile } from '@/lib/company-profile';
import type { EngineeringStudyDocument } from '@/lib/projects/engineering-report-engine/types';
import { renderEngineeringReport } from '@/lib/projects/engineering-report-engine/renderer';

/**
 * Build printable A4 HTML for the engineering study.
 * Delegates to the Nasaim-style ReportRenderer (presentation layer).
 */
export function buildEngineeringStudyHtml(params: {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
}): string {
  return renderEngineeringReport({
    document: params.document,
    company: params.company,
    template: 'nasaim',
  });
}

export function printEngineeringStudy(params: {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
  clientCode?: string;
}) {
  const html = buildEngineeringStudyHtml(params);
  const title =
    params.document.locale === 'ar'
      ? `دراسة هندسية — ${params.document.project_name}`
      : `Engineering Study — ${params.document.project_name}`;
  void import('@/lib/print/document-preview').then(({ openDocumentPreview }) => {
    openDocumentPreview({
      title,
      html,
      fileName: `engineering-study-${params.clientCode || params.document.client_code || 'report'}`,
    });
  });
}
