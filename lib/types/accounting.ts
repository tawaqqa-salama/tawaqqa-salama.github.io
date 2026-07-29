import type { AccountTypeId, VoucherTypeId } from '@/lib/constants/accounting';

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  account_type: AccountTypeId;
  parent_id: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  department: string | null;
  branch: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface JournalEntryLine {
  id?: string;
  journal_entry_id?: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  description?: string | null;
  debit: number;
  credit: number;
  cost_center_id?: string | null;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string | null;
  client_id: string | null;
  client_name?: string | null;
  reference_type: string | null;
  reference_id: string | null;
  cost_center_id: string | null;
  cost_center_name?: string | null;
  status: string;
  created_at?: string;
  lines?: JournalEntryLine[];
}

export interface Voucher {
  id: string;
  voucher_number: string;
  voucher_type: VoucherTypeId;
  voucher_date: string;
  client_id: string | null;
  client_name?: string | null;
  amount: number;
  vat_amount: number;
  total_amount: number;
  payment_method: string | null;
  reference_number: string | null;
  description: string | null;
  cost_center_id: string | null;
  cost_center_name?: string | null;
  journal_entry_id: string | null;
  status: string;
  created_at?: string;
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountTypeId;
  debit: number;
  credit: number;
  balance: number;
}

export interface IncomeStatementSummary {
  revenue: number;
  expenses: number;
  netIncome: number;
}

export interface VatSummary {
  outputVat: number;
  taxableRevenue: number;
  voucherCount: number;
}

export interface DashboardJournalRow {
  id: string;
  documentNumber: string;
  entryType: string;
  entryNumber: string;
  entryTitle: string;
  entryValue: number;
  entryDate: string;
  entryStatus: string;
}

export interface AccountingDashboardStats {
  journalCount: number;
  voucherCount: number;
  accountCount: number;
  costCenterCount: number;
  incomeSummary: IncomeStatementSummary;
  vatSummary: VatSummary;
  costCenterDistribution: { label: string; value: number; color?: string }[];
  entryTypeDistribution: { label: string; value: number }[];
  recentEntries: DashboardJournalRow[];
}
