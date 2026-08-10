import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';
import {
  generateEngineeringStudy,
  printEngineeringStudy,
  type ReportLocale,
} from '@/lib/projects/engineering-report-engine';
import {
  printAdminUcTechnicalReport,
  shouldUseAdminUcReport,
} from '@/lib/projects/admin-uc-report';

/**
 * Technical report print router:
 * - Administrative + under construction → independent Admin UC template
 * - Otherwise → Nasaim-style engineering study
 */
export function printTechnicalReport(params: {
  client: ClientRecord;
  report: TechnicalReport;
  company: CompanyProfile;
  engineeringData?: ProjectEngineeringData | null;
  locale?: ReportLocale;
}) {
  if (
    shouldUseAdminUcReport({
      client: params.client,
      report: params.report,
      engineeringData: params.engineeringData,
    })
  ) {
    printAdminUcTechnicalReport({
      client: params.client,
      report: params.report,
      company: params.company,
      engineeringData: params.engineeringData,
    });
    return;
  }

  const document = generateEngineeringStudy({
    client: params.client,
    report: params.report,
    engineeringData: params.engineeringData,
    locale: params.locale || 'ar',
  });

  printEngineeringStudy({
    document,
    company: params.company,
    clientCode: params.client.client_code,
  });
}
