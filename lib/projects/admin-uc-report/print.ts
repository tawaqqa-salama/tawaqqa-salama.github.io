import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';
import { generateAdminUcReport } from '@/lib/projects/admin-uc-report/generate';
import { buildAdminUcReportHtml } from '@/lib/projects/admin-uc-report/template';
import type { DocumentPreviewPayload } from '@/lib/print/document-preview';

export type AdminUcTechnicalReportParams = {
  client: ClientRecord;
  report: TechnicalReport;
  company: CompanyProfile;
  engineeringData?: ProjectEngineeringData | null;
};

/**
 * يبني وثيقة التقرير الرسمي نفسها لاستعمال المعاينة أو الطباعة أو تنزيل PDF.
 * تشخيصات المطابقة التفصيلية تبقى داخل واجهة المراجعة الهندسية ولا تُلحق
 * بتقرير العميل الرسمي؛ هذا لا يغير محرك المطابقة أو حالته أو حساباته.
 */
export function buildAdminUcTechnicalReportPayload(
  params: AdminUcTechnicalReportParams
): DocumentPreviewPayload {
  const document = generateAdminUcReport({
    client: params.client,
    report: params.report,
    engineeringData: params.engineeringData,
    company: params.company,
  });
  const html = buildAdminUcReportHtml({ document, company: params.company });
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
