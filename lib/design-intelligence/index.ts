export {
  listKnowledgeDocuments,
  listKnowledgeDocumentsSync,
  uploadAndIndexKnowledgeFile,
  reingestKnowledgeDocumentFromStorage,
  ragQuery,
  inferRequestedCodeFamilies,
  MIN_RESULT_SCORE,
  RELIABLE_SCORE,
  ensureSeedKnowledgeBase,
  knowledgeCategories,
  indexDocumentText,
  KnowledgePersistError,
  buildKnowledgeUploadDiagnostics,
  type KnowledgeUploadDiagnostics,
  type RagQueryOptions,
} from '@/lib/design-intelligence/knowledge-base';
export {
  buildDefaultDesignPlan,
  buildOccupancyChecklist,
  suggestEngineeringSystems,
  timelineHealth,
  computeChecklistProgress,
  autoRescheduleTasks,
  markCriticalPath,
} from '@/lib/design-intelligence/planner';
export {
  listWorkspaces,
  listTasks,
  listChecklists,
  listLessons,
  listNotifications,
  createWorkspaceFromClient,
  updateWorkspace,
  addWorkspaceNote,
  updateTask,
  rescheduleWorkspaceTasks,
  saveChecklist,
  addLesson,
  pushNotification,
  markNotificationRead,
  seedSmartNotifications,
  analyticsSnapshot,
} from '@/lib/design-intelligence/workspace-store';
export {
  listIndexingJobs,
  enqueueIndexingJob,
  completeIndexingJob,
  queuedJobCount,
} from '@/lib/design-intelligence/jobs';
export {
  evaluateEngineeringForm,
  applyEngineeringChange,
  recommendFromRules,
  loadEngineeringRulesFromDb,
  syncSeedRulesToSupabase,
  selectionFromWorkspace,
  getEngineeringFields,
  getEngineeringRules,
} from '@/lib/design-intelligence/rules-engine';
export {
  decideEngineeringForm,
  commitEngineeringDecision,
  assertEngineeringDecision,
  explainEngineeringDecisions,
} from '@/lib/design-intelligence/decision-engine';
export type * from '@/lib/design-intelligence/types';
export type * from '@/lib/design-intelligence/rules-types';
export * from '@/lib/design-intelligence/code-knowledge';
export {
  codesFromQuotationServices,
  buildProjectKnowledgeContext,
  matchKnowledgeDocuments,
  syncKnowledgeLinksToDesignCenter,
  syncKnowledgeLinksToDesignCenterSync,
  runProjectKnowledgeCompliance,
  describeSalesKnowledgePreview,
  QUOTATION_SERVICE_KNOWLEDGE_MAP,
} from '@/lib/design-intelligence/project-knowledge-bridge';
export {
  isVerifiedKnowledgeStatus,
  shouldWarnUnverifiedKnowledgeSource,
} from '@/lib/design-intelligence/verification-status';

export {
  assertChunkDocumentCodeConsistency,
  chunkMatchesQueryTopic,
  inferRequestedBroadFamilies,
  normalizeCanonicalCodeFamily,
  reconcileChunkCodeWithDocument,
  resolveSourceCodeFamily,
  shouldRouteAsNfpa13Document,
  type BroadCodeFamily,
  type CanonicalCodeFamily,
} from '@/lib/design-intelligence/code-family';
