import type { CompanyProfile } from '@/lib/company-profile';
import type { EngineeringStudyDocument } from '@/lib/projects/engineering-report-engine/types';
import { buildExistingFinalTechnicalReportHtml } from '@/lib/projects/engineering-report-engine/renderer/existing-final-technical-template';
import { documentToFlowBlocks } from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import { renderHtmlToPdfBuffer } from '@/lib/print/chromium-html-to-pdf.server';
import { estimateExistingReportPageMap } from '@/lib/print/existing-report-page-map';
import { existsSync } from 'node:fs';

export { estimateExistingReportPageMap, tocPageNumbersMatch } from '@/lib/print/existing-report-page-map';

function chromiumAvailable(): boolean {
  return existsSync('/usr/bin/google-chrome')
    || existsSync('/usr/local/bin/google-chrome')
    || existsSync('/usr/bin/chromium');
}

export function cleanExistingReportPdfText(value: string): string {
  return value
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\s\u0640]+/g, '')
    .replace(/[\u202B\u202C]/g, '');
}

export async function extractExistingReportPdfPages(pdfBuffer: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' ').trim());
  }
  return pages;
}

export function detectExistingReportSectionPageMap(
  pages: string[],
  chapters: { id: string; title: string }[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const chapter of [...chapters, { id: 'approvals', title: 'الاعتماد والتوقيعات' }]) {
    const prefix = `SECTION_PAGE_${chapter.id}`;
    const pageIndex = pages.findIndex((rawPage, index) => {
      if (index < 1) return false;
      const page = cleanExistingReportPdfText(rawPage);
      const start = page.indexOf(prefix);
      return start >= 0 && page.indexOf('MARKEREND', start + prefix.length) >= 0;
    });
    if (pageIndex < 0) throw new Error(`تعذر اكتشاف الصفحة للقسم: ${chapter.id}`);
    map[chapter.id] = pageIndex + 1;
  }
  return map;
}

export async function resolveExistingReportPageMap(params: {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
}): Promise<{ pageMap: Record<string, number>; chapters: ReturnType<typeof documentToFlowBlocks>['chapters'] }> {
  const { chapters } = documentToFlowBlocks(params.document);
  if (!chromiumAvailable()) {
    return { pageMap: estimateExistingReportPageMap(params.document), chapters };
  }

  const markerHtml = buildExistingFinalTechnicalReportHtml({
    ...params,
    includeDetectionMarkers: true,
  });
  const markerPdf = renderHtmlToPdfBuffer(markerHtml);
  const pages = await extractExistingReportPdfPages(markerPdf);
  const pageMap = detectExistingReportSectionPageMap(pages, chapters);

  return { pageMap, chapters };
}

export async function buildExistingFinalTechnicalReportHtmlWithPageMap(params: {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
}): Promise<{ html: string; pageMap: Record<string, number> }> {
  const { pageMap } = await resolveExistingReportPageMap(params);
  const html = buildExistingFinalTechnicalReportHtml({ ...params, pageMap });
  return { html, pageMap };
}

export async function renderExistingFinalTechnicalReportPdf(params: {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
}): Promise<{ pdfBuffer: Buffer; pageMap: Record<string, number>; html: string }> {
  const { html, pageMap } = await buildExistingFinalTechnicalReportHtmlWithPageMap(params);
  const pdfBuffer = renderHtmlToPdfBuffer(html);
  return { pdfBuffer, pageMap, html };
}
