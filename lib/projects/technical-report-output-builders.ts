import type { CompanyProfile } from '@/lib/company-profile';
import { buildExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import { buildUnderConstructionTechnicalReportModel } from '@/lib/projects/under-construction-technical-report-model';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export function buildExistingOutputModel(
  client: ClientRecord,
  data: ProjectEngineeringData,
  company: CompanyProfile
) {
  return buildExistingTechnicalReportModel(client, data, company);
}

export function buildUnderConstructionOutputModel(
  client: ClientRecord,
  data: ProjectEngineeringData,
  company: CompanyProfile
) {
  return buildUnderConstructionTechnicalReportModel(client, data, company);
}
