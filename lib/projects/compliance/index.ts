/**
 * Saudi Code Compliance Engine (SBC 201 / SBC 801) — public API.
 */

export type * from '@/lib/projects/compliance/types';
export {
  evidence,
  formatEvidenceList,
  hasNonEmpty,
  parseNumber,
  parseYesNoUnknown,
  ynFromYesNoValue,
  compareToThreshold,
  needsData,
  passEval,
  failEval,
  naEval,
} from '@/lib/projects/compliance/evidence';
export {
  applyOverride,
  summarizeResults,
  gateBlockerMessages,
  formatInputs,
  COMPLIANCE_GATED_STAGES,
  isComplianceGatedStage,
} from '@/lib/projects/compliance/results';
export { COMPLIANCE_RULES, getComplianceRuleById, requiredExitsFromOccupantLoad } from '@/lib/projects/compliance/rules';
export {
  resolveTravelDistanceLimitM,
  resolveExitSeparationMinM,
  resolveFireAccessMinWidthM,
  occupancyLabel,
} from '@/lib/projects/compliance/thresholds';
export {
  buildComplianceContext,
  resolveFireProtectionDesign,
  resolveBuildingAreaM2,
  resolveConstructionType,
} from '@/lib/projects/compliance/context';
export {
  evaluateRule,
  runComplianceRules,
  runProjectCompliance,
  isFullyCompliant,
  complianceStatusLabelAr,
  COMPLIANCE_ASSESSMENT_DISCLAIMER_AR,
} from '@/lib/projects/compliance/engine';
export { buildComplianceMatrixHtml } from '@/lib/projects/compliance/matrix-html';
export { appendComplianceMatrixToReportHtml } from '@/lib/projects/compliance/pdf-appendix';
