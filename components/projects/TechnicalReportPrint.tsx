import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';
import {
  generateEngineeringStudy,
  type ReportLocale,
} from '@/lib/projects/engineering-report-engine';
import {
  printAdminUcTechnicalReport,
  shouldUseAdminUcReport,
} from '@/lib/projects/admin-uc-report';
import { hydrateTechnicalReportPhotosForDisplay } from '@/lib/projects/technical-report-photos';
import { appendComplianceMatrixToReportHtml } from '@/lib/projects/compliance';
import { buildEngineeringStudyHtml } from '@/lib/projects/engineering-report-engine/print-html';
import { openDocumentPreview } from '@/lib/print/document-preview';

/**
 * Technical report print router:
 * - Administrative + under construction → independent Admin UC template
 * - Otherwise → Nasaim-style engineering study
 * Both paths append the SBC Compliance Matrix without removing existing sections.
 */
export async function printTechnicalReport(params: {
  client: ClientRecord;
  report: TechnicalReport;
  company: CompanyProfile;
  engineeringData?: ProjectEngineeringData | null;
  locale?: ReportLocale;
}) {
  const report = await hydrateTechnicalReportPhotosForDisplay(params.report);
  const engineeringData = params.engineeringData
    ? {
        ...params.engineeringData,
        technical_report: report,
      }
    : params.engineeringData;

  if (
    shouldUseAdminUcReport({
      client: params.client,
      report,
      engineeringData,
    })
  ) {
    printAdminUcTechnicalReport({
      client: params.client,
      report,
      company: params.company,
      engineeringData,
    });
    return;
  }

  const document = generateEngineeringStudy({
    client: params.client,
    report,
    engineeringData,
    locale: params.locale || 'ar',
  });

  const baseHtml = buildEngineeringStudyHtml({
    document,
    company: params.company,
  });
  const html = appendComplianceMatrixToReportHtml({
    html: baseHtml,
    client: params.client,
    engineeringData,
  });

  const title =
    document.locale === 'ar'
      ? `دراسة هندسية — ${document.project_name}`
      : `Engineering Study — ${document.project_name}`;

  openDocumentPreview({
    title,
    html,
    fileName: `engineering-study-${params.client.client_code || document.client_code || 'report'}`,
  });
}
