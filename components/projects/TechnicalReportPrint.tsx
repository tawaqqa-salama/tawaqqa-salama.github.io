import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';
import {
  generateEngineeringStudy,
  printEngineeringStudy,
  type ReportLocale,
} from '@/lib/projects/engineering-report-engine';

/**
 * Technical report print — now emits the full Engineering Study
 * (consultancy structure: cover, TOC, 29 content chapters + approvals).
 * Form UI / project list are unchanged.
 */
export function printTechnicalReport(params: {
  client: ClientRecord;
  report: TechnicalReport;
  company: CompanyProfile;
  engineeringData?: ProjectEngineeringData | null;
  locale?: ReportLocale;
}) {
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
