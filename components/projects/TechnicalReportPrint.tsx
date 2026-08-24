import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData, TechnicalReport } from '@/lib/types/project-reports';
import { type ReportLocale } from '@/lib/projects/engineering-report-engine';
import { generateOfficialTechnicalReportDocument } from '@/lib/projects/official-technical-report-document';
import {
  buildAdminUcTechnicalReportPayload,
  shouldUseAdminUcReport,
} from '@/lib/projects/admin-uc-report';
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

/**
 * Technical report router:
 * - Administrative + under construction → independent Admin UC template
 * - Otherwise → official client-facing technical report template
 * The same canonical HTML payload is reused for preview, print, and PDF download.
 */
export async function buildTechnicalReportDocumentPayload(
  params: TechnicalReportPrintParams
): Promise<DocumentPreviewPayload> {
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
  // Presentation-only hydration and media measurements remain in memory for this document action.
  const report = { ...photosHydrated, evidence };
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
    return buildAdminUcTechnicalReportPayload({
      client: params.client,
      report,
      company: params.company,
      engineeringData,
    });
  }

  const document = generateOfficialTechnicalReportDocument({
    client: params.client,
    report,
    engineeringData,
    locale: params.locale || 'ar',
    evidenceMediaPresentation,
  });

  const html = buildOfficialTechnicalReportHtml({
    document,
    company: params.company,
  });

  const title =
    document.locale === 'ar'
      ? `دراسة هندسية — ${document.project_name}`
      : `Engineering Study — ${document.project_name}`;

  return {
    title,
    html,
    fileName: `engineering-study-${params.client.client_code || document.client_code || 'report'}`,
    downloadFormat: 'pdf',
  };
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
