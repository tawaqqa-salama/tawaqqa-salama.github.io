import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';
import { generateAdminUcReport } from '@/lib/projects/admin-uc-report/generate';
import { buildAdminUcReportHtml } from '@/lib/projects/admin-uc-report/template';
import { appendComplianceMatrixToReportHtml } from '@/lib/projects/compliance';
import type { DocumentPreviewPayload } from '@/lib/print/document-preview';

export type AdminUcTechnicalReportParams = {
  client: ClientRecord;
  report: TechnicalReport;
  company: CompanyProfile;
  engineeringData?: ProjectEngineeringData | null;
};

/** يبني HTML التقرير الإداري نفسه لاستعمال المعاينة أو الطباعة أو تنزيل PDF. */
export function buildAdminUcTechnicalReportPayload(
  params: AdminUcTechnicalReportParams
): DocumentPreviewPayload {
  const document = generateAdminUcReport({
    client: params.client,
    report: params.report,
    engineeringData: params.engineeringData,
    company: params.company,
  });
  const baseHtml = buildAdminUcReportHtml({ document, company: params.company });
  const html = appendComplianceMatrixToReportHtml({
    html: baseHtml,
    client: params.client,
    engineeringData: params.engineeringData,
  });
  return {
    title: `التقرير الفني — مبنى إداري تحت الإنشاء — ${document.project_name}`,
    html,
    fileName: `admin-uc-technical-report-${params.client.client_code || 'report'}`,
    downloadFormat: 'pdf',
  };
}

/** توافق خلفي: الاسم السابق يفتح المعاينة فقط. */
export function printAdminUcTechnicalReport(params: AdminUcTechnicalReportParams) {
  void import('@/lib/print/document-preview').then(({ openDocumentPreview }) => {
    openDocumentPreview(buildAdminUcTechnicalReportPayload(params));
  });
}
