import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';
import { generateAdminUcReport } from '@/lib/projects/admin-uc-report/generate';
import { buildAdminUcReportHtml } from '@/lib/projects/admin-uc-report/template';

export function printAdminUcTechnicalReport(params: {
  client: ClientRecord;
  report: TechnicalReport;
  company: CompanyProfile;
  engineeringData?: ProjectEngineeringData | null;
}) {
  const document = generateAdminUcReport({
    client: params.client,
    report: params.report,
    engineeringData: params.engineeringData,
    company: params.company,
  });
  const html = buildAdminUcReportHtml({ document, company: params.company });
  void import('@/lib/print/document-preview').then(({ openDocumentPreview }) => {
    openDocumentPreview({
      title: `التقرير الفني — مبنى إداري تحت الإنشاء — ${document.project_name}`,
      html,
      fileName: `admin-uc-technical-report-${params.client.client_code || 'report'}`,
    });
  });
}
