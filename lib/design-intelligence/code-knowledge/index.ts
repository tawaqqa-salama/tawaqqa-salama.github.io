/**
 * NFPA Code Knowledge Pipeline — public API.
 * RAG retrieves/explains/cites. Compliance authority remains lib/projects/compliance.
 */

export type * from '@/lib/design-intelligence/code-knowledge/types';
export {
  resetCodeKnowledgeStore,
  getCodeKnowledgeStore,
} from '@/lib/design-intelligence/code-knowledge/store';
export {
  listCodeEditions,
  getCodeEdition,
  registerCodeEdition,
  advanceCodeEditionStatus,
  registerNfpa13_2025ProjectEdition,
  listAvailableCodes,
} from '@/lib/design-intelligence/code-knowledge/registry';
export {
  adoptCodeEditionForProject,
  getProjectAdoptedEdition,
  adoptNfpa13_2025ForProject,
  applyAdoptionToEngineeringData,
  resolveProjectCodeEdition,
} from '@/lib/design-intelligence/code-knowledge/adoption';
export {
  detectSourceRefsFromText,
  assertCitationPresentInText,
} from '@/lib/design-intelligence/code-knowledge/source-refs';
export {
  registerKnowledgeDocument,
  listPipelineJobs,
  getKnowledgeDocument,
  listKnowledgeDocumentsForCompany,
  processNextPipelineJob,
  runDocumentPipeline,
  retryFailedJob,
  listChunksForDocument,
  companyCanAccessDocument,
} from '@/lib/design-intelligence/code-knowledge/ingestion';
export {
  searchCodeKnowledge,
  explainCodeKnowledgeHits,
} from '@/lib/design-intelligence/code-knowledge/search';
export { compareCodeEditions } from '@/lib/design-intelligence/code-knowledge/edition-compare';
export {
  listEditionRules,
  getEditionRule,
  registerEditionRule,
  registerNfpa13_2025RuleShells,
  registerEditionRuleShellsForNewEdition,
  supersedeRule,
  FIELD_BY_RULE,
} from '@/lib/design-intelligence/code-knowledge/rule-registry';
export {
  evaluateAdvisoryComplianceAttempt,
  ragHitsCannotProducePass,
  mapComplianceBlockerStatus,
  canAuthoritativePass,
} from '@/lib/design-intelligence/code-knowledge/compliance-gate';
export { NFPA13_PIPELINE_RULE_IDS } from '@/lib/design-intelligence/code-knowledge/types';
