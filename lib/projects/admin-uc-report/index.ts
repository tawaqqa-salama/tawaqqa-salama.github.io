export {
  shouldUseAdminUcReport,
  isAdministrativeBuildingActivity,
  isUnderConstructionStatus,
  resolveLifecycleMode,
} from '@/lib/projects/admin-uc-report/select';
export {
  mergeFireProtectionDesign,
  refreshDerivedDesign,
  getTankVolumeCheck,
  buildDefaultReviewRows,
} from '@/lib/projects/admin-uc-report/design';
export { generateAdminUcReport, type AdminUcDocument } from '@/lib/projects/admin-uc-report/generate';
export { buildAdminUcReportHtml } from '@/lib/projects/admin-uc-report/template';
export {
  buildAdminUcTechnicalReportPayload,
  printAdminUcTechnicalReport,
  type AdminUcTechnicalReportParams,
} from '@/lib/projects/admin-uc-report/print';
