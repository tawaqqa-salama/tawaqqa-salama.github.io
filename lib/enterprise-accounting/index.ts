/**
 * Enterprise Accounting & Finance — public API
 */

export * from "./types";
export * from "./coa-template";
export * from "./rules-catalog";
export {
  validateJournalEntry,
  assertCanPost,
  summarizeViolations,
  type RulesContext,
} from "./rules-engine";
export * from "./vat";
export * from "./statements";
export * from "./ai-copilot";
export * from "./audit";
export * from "./aging";
export * from "./fixed-assets";
export * from "./project-accounting";
export {
  createDemoState,
  loadEnterpriseState,
  saveEnterpriseState,
  deriveDashboard,
  deriveAudit,
  deriveAging,
  journalsToPostedLines,
  type EnterpriseAccountingState,
} from "./store";
