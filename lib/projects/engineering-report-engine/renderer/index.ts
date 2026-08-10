export { renderEngineeringReport, type ReportTemplateId, type ReportRenderInput } from '@/lib/projects/engineering-report-engine/renderer/report-renderer';
export { buildNasaimReportHtml } from '@/lib/projects/engineering-report-engine/renderer/nasaim-template';
export {
  placeSectionImages,
  groupImageRows,
  buildDynamicTocPages,
  estimateSectionPages,
  sanitizeCaption,
} from '@/lib/projects/engineering-report-engine/renderer/image-placement';
