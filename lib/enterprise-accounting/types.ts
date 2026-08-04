/**
 * Enterprise Accounting & Finance — domain types
 * IFRS / SOCPA / ZATCA / Saudi VAT aligned
 */

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "contra_asset"
  | "contra_liability";

export type AccountNature = "debit" | "credit";

export type VatCategory =
  | "standard_15"
  | "zero_rated"
  | "exempt"
  | "out_of_scope"
  | "not_applicable";

export type JournalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "posted"
  | "reversed"
  | "rejected"
  | "void";

export type PeriodStatus = "open" | "soft_closed" | "locked" | "closed";

export type FiscalYearStatus = "open" | "closed" | "locked";

export type ArDocumentType =
  | "invoice"
  | "credit_note"
  | "debit_note"
  | "receipt"
  | "adjustment";

export type ApDocumentType =
  | "bill"
  | "purchase_invoice"
  | "debit_note"
  | "credit_note"
  | "payment"
  | "adjustment";

export type DepreciationMethod =
  | "straight_line"
  | "declining_balance"
  | "units_of_production";

export type RuleSeverity = "error" | "warning" | "info";

export type RuleCategory =
  | "allowed_accounts"
  | "vat"
  | "journal_validation"
  | "posting_validation"
  | "account_relationships"
  | "required_documents"
  | "approval"
  | "fiscal_lock"
  | "period_closing"
  | "ifrs"
  | "socpa"
  | "zatca"
  | "currency"
  | "project";

export interface ChartAccount {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  accountType: AccountType;
  nature: AccountNature;
  parentId: string | null;
  parentCode: string | null;
  level: number;
  isPostable: boolean;
  isActive: boolean;
  isLocked: boolean;
  currencyCode: string;
  vatCategory: VatCategory;
  costCenterRequired: boolean;
  projectRequired: boolean;
  openingBalance: number;
  openingBalanceSide: AccountNature;
  mappingKey: string | null;
  children?: ChartAccount[];
}

export interface CostCenter {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  parentId: string | null;
  branchId: string | null;
  projectId: string | null;
  isActive: boolean;
  autoFromProject: boolean;
}

export interface FiscalPeriod {
  id: string;
  fiscalYearId: string;
  periodNumber: number;
  nameAr: string;
  nameEn: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
}

export interface FiscalYear {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  startDate: string;
  endDate: string;
  status: FiscalYearStatus;
  isCurrent: boolean;
  periods: FiscalPeriod[];
}

export interface JournalLineDraft {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
  vatCategory?: VatCategory;
  vatAmount?: number;
  currencyCode?: string;
  exchangeRate?: number;
  baseDebit?: number;
  baseCredit?: number;
}

export interface JournalEntryDraft {
  id?: string;
  entryNumber?: string;
  entryDate: string;
  postingDate?: string;
  entryType:
    | "manual"
    | "automatic"
    | "recurring"
    | "reversing"
    | "opening"
    | "closing"
    | "adjustment";
  description: string;
  reference?: string;
  currencyCode?: string;
  exchangeRate?: number;
  projectId?: string | null;
  costCenterId?: string | null;
  branchId?: string | null;
  lines: JournalLineDraft[];
  attachments?: { name: string; url: string }[];
  requiresApproval?: boolean;
  sourceModule?: string;
  sourceDocumentType?: string;
  sourceDocumentId?: string;
}

export interface AccountingRule {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: RuleCategory;
  severity: RuleSeverity;
  enabled: boolean;
  descriptionAr: string;
  descriptionEn: string;
  ifrsReference?: string;
  socpaReference?: string;
  zatcaReference?: string;
  vatReference?: string;
  /** Predicate key used by the engine */
  checkId: string;
  config?: Record<string, unknown>;
}

export interface RuleViolation {
  ruleCode: string;
  category: RuleCategory;
  severity: RuleSeverity;
  messageAr: string;
  messageEn: string;
  field?: string;
  ifrsReference?: string;
  socpaReference?: string;
  zatcaReference?: string;
  vatReference?: string;
}

export interface ValidationResult {
  valid: boolean;
  canPost: boolean;
  canSuggest: boolean;
  violations: RuleViolation[];
  warnings: RuleViolation[];
  infos: RuleViolation[];
}

export interface CopilotSuggestion {
  suggestedEntry: JournalEntryDraft | null;
  explanationAr: string;
  explanationEn: string;
  validation: ValidationResult;
  ifrsReferences: string[];
  socpaReferences: string[];
  zatcaReferences: string[];
  vatReferences: string[];
  blockedReasonAr?: string;
  blockedReasonEn?: string;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  accountType: AccountType;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface StatementLine {
  code: string;
  labelAr: string;
  labelEn: string;
  amount: number;
  level: number;
  isTotal?: boolean;
  children?: StatementLine[];
}

export interface FinancialDashboardKpis {
  revenue: number;
  expenses: number;
  profit: number;
  cashFlow: number;
  receivables: number;
  payables: number;
  bankBalance: number;
  vatDue: number;
  projectProfitability: number;
  budgetStatusPct: number;
  currency: string;
  asOf: string;
}

export interface ProjectLedgerSummary {
  projectId: string;
  costCenterId: string;
  revenue: number;
  expenses: number;
  profit: number;
  budget: number;
  actualCost: number;
  committedCost: number;
  cashIn: number;
  cashOut: number;
  marginPct: number;
}

export interface AgingBucket {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

export interface AuditFinding {
  id: string;
  findingType: string;
  severity: RuleSeverity | "critical";
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  status: "open" | "acknowledged" | "resolved" | "false_positive";
  relatedDocumentType?: string;
  relatedDocumentId?: string;
}

export interface VatReturnSummary {
  periodLabel: string;
  standardRatedSales: number;
  outputVat: number;
  zeroRatedSales: number;
  exemptSales: number;
  standardRatedPurchases: number;
  inputVat: number;
  netVatDue: number;
  currency: string;
}

export type EnterpriseFinanceTab =
  | "dashboard"
  | "coa"
  | "gl"
  | "ar"
  | "ap"
  | "banking"
  | "assets"
  | "projects"
  | "vat"
  | "zatca"
  | "statements"
  | "budgeting"
  | "rules"
  | "copilot"
  | "audit"
  | "security";
