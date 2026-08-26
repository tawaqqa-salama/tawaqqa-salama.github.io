import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
  type TechnicalReport,
} from '@/lib/types/project-reports';
import { buildUnderConstructionTechnicalReportModel } from '@/lib/projects/under-construction-technical-report-model';
import { buildUnderConstructionFinalTechnicalReportHtml } from '@/lib/projects/under-construction-final-report-template';
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
  const data = params.engineeringData || {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: params.report,
  };
  const model = buildUnderConstructionTechnicalReportModel(params.client, data, params.company);
  const html = buildUnderConstructionFinalTechnicalReportHtml({ model, company: params.company });
  return {
    title: `التقرير الفني للمبنى تحت الإنشاء — ${model.project_information.project_name}`,
    html,
    fileName: `under-construction-technical-report-${params.client.client_code || 'report'}`,
    downloadFormat: 'pdf',
  };
}

export function buildUnderConstructionFinalTechnicalReportPayload(
  params: AdminUcTechnicalReportParams
): DocumentPreviewPayload {
  return buildAdminUcTechnicalReportPayload(params);
}

/** توافق خلفي: الاسم السابق يفتح المعاينة فقط. */
export function printAdminUcTechnicalReport(params: AdminUcTechnicalReportParams) {
  void import('@/lib/print/document-preview').then(({ openDocumentPreview }) => {
    openDocumentPreview(buildAdminUcTechnicalReportPayload(params));
  });
}
