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
  blockedEval,
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
  COMPLIANCE_AUTHORITY,
} from '@/lib/projects/compliance/engine';
export {
  RULE_CODE_REFS,
  citationFor,
  primaryStandardFor,
} from '@/lib/projects/compliance/code-refs';
export type { StandardFamily, CodeCitation } from '@/lib/projects/compliance/code-refs';
export type { ThresholdSourceKind } from '@/lib/projects/compliance/thresholds';
export {
  RULE_MATRIX,
  getRuleMatrixDefinition,
  listRuleMatrixIds,
  resolveMatrixThreshold,
  isCompleteCodeMapping,
  formatCodeMapping,
} from '@/lib/projects/compliance/code-database';
export type {
  RuleMatrixDefinition,
  DocumentedCodeLimit,
  SprinklerStatus,
  FireClass,
} from '@/lib/projects/compliance/code-database';
export { MATRIX_COMPLIANCE_RULES } from '@/lib/projects/compliance/matrix-rules';
export {
  SBC201_EGRESS_RULES,
  getSbc201EgressRuleDef,
  listSbc201EgressRuleIds,
  countSbc201VerifiedThresholds,
  countSbc201CodeTableRequired,
  resolveSbc201Threshold,
  isSbc2012024Mapping,
} from '@/lib/projects/compliance/sbc201-egress-database';
export { SBC201_EGRESS_COMPLIANCE_RULES } from '@/lib/projects/compliance/sbc201-egress-rules';
export { buildComplianceMatrixHtml } from '@/lib/projects/compliance/matrix-html';
export { appendComplianceMatrixToReportHtml } from '@/lib/projects/compliance/pdf-appendix';
export {
  resolveEngineeringFields,
  resolveOccupancy,
  resolveBuildingType,
  resolveFloorAreas,
  resolveZones,
  resolveNumberOfFloors,
  resolveBuildingHeightM,
  resolveFireAreaM2,
  resolvePump,
  resolveTank,
  resolveEgressData,
  resolveApplicableCodes,
  resolveCodeEdition,
  resolverBlocksAuthoritativePass,
} from '@/lib/projects/compliance/resolvers';
export type { ResolverState, ResolvedField, EngineeringResolverBundle } from '@/lib/projects/compliance/resolvers';
export {
  freezeComplianceSnapshot,
  attachFrozenComplianceSnapshot,
  complianceRunFromFrozenSnapshot,
  resolveComplianceRunForReport,
} from '@/lib/projects/compliance/snapshot';
export { buildSbc201EgressFromCanonical } from '@/lib/projects/compliance/context';
export {
  buildNfpaEngineeringContext,
  buildNfpaComplianceRules,
  runNfpaArchitectureFindings,
  rejectAdvisoryPassAttempt,
  isNfpaAdvisorySource,
  NFPA_AUTHORITY,
  NFPA_ADVISORY_SOURCES,
  NFPA_RULE_DEFS,
  evaluateNfpa13,
  evaluateNfpa20,
  evaluateNfpa22,
  evaluateNfpa72,
  evaluateNfpa101,
  evaluateNfpa13NumericRule,
  NFPA13_CODE,
  NFPA13_PLATFORM_EDITION,
  NFPA13_PLATFORM_THRESHOLDS,
  NFPA13_RULE_DEFINITIONS,
  getNfpa13RuleDefinition,
  listNfpa13RuleIds,
  resolveNfpa13EncodedRow,
} from '@/lib/projects/compliance/nfpa';
export type {
  NfpaEngineeringContext,
  NfpaRuleFinding,
  NfpaRuleStatus,
  NfpaStandardCode,
  Nfpa13EncodedRow,
  Nfpa13RuleDefinition,
} from '@/lib/projects/compliance/nfpa';
