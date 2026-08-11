/**
 * Saudi Code Compliance Engine (SBC 201 / SBC 801) — public API.
 * Additive layer over existing project / fire / egress / design-center code.
 */

export type * from '@/lib/projects/compliance/types';
export {
  evidence,
  formatEvidenceList,
  hasNonEmpty,
  parseNumber,
  parseYesNoUnknown,
  ynFromYesNoValue,
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
export { buildComplianceContext, resolveFireProtectionDesign } from '@/lib/projects/compliance/context';
export {
  evaluateRule,
  runComplianceRules,
  runProjectCompliance,
  isFullyCompliant,
  complianceStatusLabelAr,
} from '@/lib/projects/compliance/engine';
export { buildComplianceMatrixHtml } from '@/lib/projects/compliance/matrix-html';
export { appendComplianceMatrixToReportHtml } from '@/lib/projects/compliance/pdf-appendix';
