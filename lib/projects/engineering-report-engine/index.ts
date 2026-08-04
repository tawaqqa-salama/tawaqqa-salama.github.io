export type {
  EngineeringStudyDocument,
  EngineeringStudySection,
  EngineeringStudySectionId,
  EngineeringStudyParagraph,
  ReportLocale,
} from '@/lib/projects/engineering-report-engine/types';
export { MISSING_SECTION_AR, MISSING_SECTION_EN } from '@/lib/projects/engineering-report-engine/types';
export { ENGINEERING_STUDY_SECTIONS } from '@/lib/projects/engineering-report-engine/sections';
export {
  buildEngineeringReportContext,
  type EngineeringReportContext,
} from '@/lib/projects/engineering-report-engine/context';
export { generateEngineeringStudy } from '@/lib/projects/engineering-report-engine/generate';
export {
  buildEngineeringStudyHtml,
  printEngineeringStudy,
} from '@/lib/projects/engineering-report-engine/print-html';
