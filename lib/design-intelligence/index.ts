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
} from '@/lib/design-intelligence/planner';
export {
  listWorkspaces,
  listTasks,
  listChecklists,
  listLessons,
  listNotifications,
  createWorkspaceFromClient,
  updateTask,
  saveChecklist,
  addLesson,
  pushNotification,
  markNotificationRead,
  analyticsSnapshot,
} from '@/lib/design-intelligence/workspace-store';
export type * from '@/lib/design-intelligence/types';
