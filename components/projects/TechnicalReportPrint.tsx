import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
  type TechnicalReport,
} from '@/lib/types/project-reports';
import { type ReportLocale } from '@/lib/projects/engineering-report-engine';
import { buildAdminUcTechnicalReportPayload } from '@/lib/projects/admin-uc-report';
import {
  buildExistingOutputModel,
  buildUnderConstructionOutputModel,
} from '@/lib/projects/technical-report-output-builders';
import {
  resolveTechnicalReportOutput,
  TechnicalReportOutputBlockedError,
  type ExistingTechnicalReportOutput,
  type TechnicalReportOutput,
  type UnderConstructionTechnicalReportOutput,
} from '@/lib/projects/technical-report-output-router';
import { generateOfficialTechnicalReportDocument } from '@/lib/projects/official-technical-report-document';
import { hydrateTechnicalReportPhotosForDisplay } from '@/lib/projects/technical-report-photos';
import { hydrateTechnicalEvidenceForDisplay } from '@/lib/projects/technical-report-evidence';
import { probeEvidenceMediaPresentation } from '@/lib/projects/technical-report-media-presentation';
import { buildOfficialTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/official-technical-template';
import {
  downloadPdfDocument,
  openDocumentPreview,
  printDocumentHtml,
  type DocumentPreviewPayload,
} from '@/lib/print/document-preview';

export type TechnicalReportPrintParams = {
  client: ClientRecord;
  report: TechnicalReport;
  company: CompanyProfile;
  engineeringData?: ProjectEngineeringData | null;
  locale?: ReportLocale;
};

function classificationOf(client: ClientRecord) {
  return client.primary_engineering_project_identity?.projectClassification ?? null;
}

/**
 * Builds the one read-only output source for all three technical-report actions.
 * The route is resolved before any template is selected and uses only the
 * canonical project identity classification.
 */
export async function buildTechnicalReportOutput(
  params: TechnicalReportPrintParams
): Promise<TechnicalReportOutput> {
  const route = resolveTechnicalReportOutput(classificationOf(params.client));
  if (route.kind === 'BLOCKED') return route;

  const photosHydrated = await hydrateTechnicalReportPhotosForDisplay(params.report);
  const evidence = await hydrateTechnicalEvidenceForDisplay(params.client.id, photosHydrated.evidence);
  const evidenceMediaPresentation = Object.fromEntries(
    await Promise.all(
      evidence.items.map(async (item) => [
        item.id,
        await probeEvidenceMediaPresentation(item.file.dataUrl, item.file.mimeType),
      ] as const)
    )
  );
  const report = { ...photosHydrated, evidence };
  const engineeringData = params.engineeringData
    ? { ...params.engineeringData, technical_report: report }
    : { ...EMPTY_PROJECT_ENGINEERING_DATA, technical_report: report };

  if (route.kind === 'EXISTING') {
    const model = buildExistingOutputModel(params.client, engineeringData, params.company);
    const document = generateOfficialTechnicalReportDocument({
      client: params.client,
      report,
      engineeringData,
      locale: params.locale || 'ar',
      evidenceMediaPresentation,
    });
    const html = buildOfficialTechnicalReportHtml({ document, company: params.company });
    const payload: DocumentPreviewPayload = {
      title: document.locale === 'ar' ? `التقرير الفني — ${document.project_name}` : `Engineering Study — ${document.project_name}`,
      html,
      fileName: `existing-technical-report-${params.client.client_code || document.client_code || 'report'}`,
      downloadFormat: 'pdf',
    };
    const output: ExistingTechnicalReportOutput = {
      kind: 'EXISTING',
      project_classification: 'EXISTING',
      model,
      document: payload,
    };
    return output;
  }

  const model = buildUnderConstructionOutputModel(params.client, engineeringData, params.company);
  const payload = buildAdminUcTechnicalReportPayload({
    client: params.client,
    report,
    company: params.company,
    engineeringData,
  });
  const output: UnderConstructionTechnicalReportOutput = {
    kind: 'UNDER_CONSTRUCTION',
    project_classification: 'UNDER_CONSTRUCTION',
    model,
    document: payload,
  };
  return output;
}

export async function buildTechnicalReportDocumentPayload(
  params: TechnicalReportPrintParams
): Promise<DocumentPreviewPayload> {
  const output = await buildTechnicalReportOutput(params);
  if (output.kind === 'BLOCKED') throw new TechnicalReportOutputBlockedError(output.message);
  return output.document;
}

/** يفتح معاينة فقط، من دون إطلاق طباعة أو تنزيل. */
export async function previewTechnicalReport(params: TechnicalReportPrintParams) {
  openDocumentPreview(await buildTechnicalReportDocumentPayload(params));
}

/** يفتح نافذة طباعة فقط، من دون فتح ورقة المعاينة. */
export async function printTechnicalReport(params: TechnicalReportPrintParams) {
  printDocumentHtml(await buildTechnicalReportDocumentPayload(params));
}

/** ينزل ملف PDF فعليًا، من دون فتح المعاينة أو نافذة الطباعة. */
export async function downloadTechnicalReportPdf(params: TechnicalReportPrintParams) {
  const payload = await buildTechnicalReportDocumentPayload(params);
  await downloadPdfDocument(payload.html, payload.fileName || payload.title);
}
