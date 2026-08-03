export {
  listKnowledgeDocuments,
  listKnowledgeDocumentsSync,
  uploadAndIndexKnowledgeFile,
  ragQuery,
  ensureSeedKnowledgeBase,
  knowledgeCategories,
  indexDocumentText,
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
export type * from '@/lib/design-intelligence/types';
