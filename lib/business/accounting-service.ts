import { supabase } from '@/lib/supabase';
import { DEFAULT_ACCOUNT_CODES, getJournalEntryTypeLabel } from '@/lib/constants/accounting';
import { isFinancialApproved } from '@/lib/business/workflow-stages';
import { nextJournalNumber, nextVoucherNumber } from '@/lib/business/document-numbers';
import { resolveFetchCompanyId } from '@/lib/data/fetchers';
import type { ClientRecord } from '@/lib/types/client';
import type {
  AccountingDashboardStats,
  ChartOfAccount,
  CostCenter,
  IncomeStatementSummary,
  JournalEntry,
  JournalEntryLine,
  TrialBalanceRow,
  VatSummary,
  Voucher,
  DashboardJournalRow,
} from '@/lib/types/accounting';
import {
  assertCanPost,
  buildDefaultChartOfAccounts,
  type ChartAccount,
  type JournalEntryDraft,
} from '@/lib/enterprise-accounting';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function generateEntryNumber(): Promise<string> {
  return nextJournalNumber();
}

export async function generateVoucherNumber(type: 'receipt' | 'payment'): Promise<string> {
  return nextVoucherNumber(type);
}

export function isJournalBalanced(lines: Pick<JournalEntryLine, 'debit' | 'credit'>[]): boolean {
  const debit = round2(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const credit = round2(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  return debit > 0 && debit === credit;
}

async function getAccountByCode(code: string): Promise<ChartOfAccount | null> {
  const companyId = resolveFetchCompanyId();
  if (!companyId) {
    console.warn('[accounting] default account lookup skipped: company_id_required');
    return null;
  }
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    console.error('[accounting] default account lookup failed', { code, message: error.message });
    return null;
  }
  return (data as ChartOfAccount | null) || null;
}

async function getDefaultCostCenterId(): Promise<string | null> {
  const companyId = resolveFetchCompanyId();
  if (!companyId) {
    console.warn('[accounting] default cost-center lookup skipped: company_id_required');
    return null;
  }
  const { data, error } = await supabase
    .from('cost_centers')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('code')
    .limit(1);
  if (error) {
    console.error('[accounting] default cost-center lookup failed', { message: error.message });
    return null;
  }
  return data?.[0]?.id || null;
}

export async function fetchAccounts(): Promise<ChartOfAccount[]> {
  const companyId = resolveFetchCompanyId();
  if (!companyId) return [];
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('code');
  return (data || []) as ChartOfAccount[];
}

export async function fetchCostCenters(): Promise<CostCenter[]> {
  const companyId = resolveFetchCompanyId();
  if (!companyId) return [];
  const { data } = await supabase
    .from('cost_centers')
    .select('*')
    .eq('company_id', companyId)
    .order('code');
  return (data || []) as CostCenter[];
}

export async function fetchJournalEntries(limit = 50): Promise<JournalEntry[]> {
  const { data: entries } = await supabase
    .from('journal_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!entries?.length) return [];

  const entryIds = entries.map((entry) => entry.id);
  const { data: lines } = await supabase.from('journal_entry_lines').select('*').in('journal_entry_id', entryIds);

  return (entries as JournalEntry[]).map((entry) => ({
    ...entry,
    lines: ((lines || []) as JournalEntryLine[]).filter((line) => line.journal_entry_id === entry.id),
  }));
}

export async function fetchVouchers(
  type?: 'receipt' | 'payment',
  limit = 40
): Promise<Voucher[]> {
  let query = supabase
    .from('vouchers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (type) query = query.eq('voucher_type', type);
  const { data } = await query;
  return (data || []) as Voucher[];
}

export function mapDbAccountsToEnterprise(rows: ChartOfAccount[]): ChartAccount[] {
  const template = buildDefaultChartOfAccounts();
  const byCode = new Map(template.map((a) => [a.code, a]));
  const parentIds = new Set(
    rows.map((row) => row.parent_id).filter((id): id is string => Boolean(id))
  );
  return rows.map((row) => {
    const seeded = byCode.get(row.code);
    const isActive = row.is_active !== false;
    // Legacy Production rows do not persist postability/lock flags. Derive
    // postability from the actual hierarchy: leaf accounts may receive lines;
    // accounts with children remain protected headers.
    const isPostable = isActive && !parentIds.has(row.id);
    return {
      id: row.id,
      code: row.code,
      nameAr: row.name,
      nameEn: row.name,
      accountType: (row.account_type as ChartAccount['accountType']) || 'asset',
      nature: seeded?.nature || 'debit',
      parentId: row.parent_id,
      parentCode: seeded?.parentCode ?? null,
      level: seeded?.level ?? 1,
      isPostable,
      isActive,
      isLocked: false,
      currencyCode: 'SAR',
      vatCategory: seeded?.vatCategory ?? 'not_applicable',
      // Soften dimensional requirements for legacy posting paths; enterprise hub uses full template.
      costCenterRequired: false,
      projectRequired: false,
      openingBalance: 0,
      openingBalanceSide: seeded?.nature || 'debit',
      mappingKey: seeded?.mappingKey ?? null,
    };
  });
}

/** Validate journal lines via Accounting Rules Engine before insert/post. */
export async function validateJournalAgainstRules(input: {
  description: string;
  costCenterId?: string | null;
  lines: Omit<JournalEntryLine, 'id' | 'journal_entry_id'>[];
  status?: string;
  approved?: boolean;
}): Promise<{ ok: boolean; error: string | null; requiresApproval?: boolean }> {
  const accounts = await fetchAccounts();
  const enterpriseAccounts =
    accounts.length > 0 ? mapDbAccountsToEnterprise(accounts) : buildDefaultChartOfAccounts();
  const codeById = new Map(accounts.map((a) => [a.id, a.code]));

  const draft: JournalEntryDraft = {
    entryDate: new Date().toISOString().slice(0, 10),
    entryType: 'manual',
    description: input.description,
    costCenterId: input.costCenterId ?? null,
    currencyCode: 'SAR',
    exchangeRate: 1,
    lines: input.lines.map((line) => ({
      accountCode:
        line.account_code ||
        codeById.get(line.account_id) ||
        enterpriseAccounts.find((a) => a.id === line.account_id)?.code ||
        '',
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      description: line.description || undefined,
      costCenterId: line.cost_center_id || input.costCenterId || null,
    })),
  };

  const willPost = !input.status || input.status === 'مرحّل' || input.status === 'posted';
  if (!willPost) {
    if (!isJournalBalanced(input.lines) && input.lines.length >= 2) {
      return { ok: false, error: 'يجب أن يتساوى مجموع المدين مع مجموع الدائن.' };
    }
    return { ok: true, error: null };
  }

  const result = assertCanPost(draft, {
    accounts: enterpriseAccounts,
    approved: input.approved === true,
    fromAi: false,
  });

  // Maker-checker alone → queue for approval (not a hard reject)
  const onlyApprovalBlock =
    !result.canPost &&
    result.violations.length > 0 &&
    result.violations.every((v) => v.ruleCode === 'APR-MKR-001');

  if (!result.canPost && !onlyApprovalBlock) {
    const msg = result.violations.map((v) => `[${v.ruleCode}] ${v.messageAr}`).join(' — ');
    return {
      ok: false,
      error: msg || 'رفض محرك القواعد المحاسبية ترحيل هذا القيد.',
    };
  }
  return {
    ok: true,
    error: null,
    requiresApproval: onlyApprovalBlock || undefined,
  };
}

export async function createJournalEntry(input: {
  description: string;
  companyId?: string | null;
  clientId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  costCenterId?: string | null;
  lines: Omit<JournalEntryLine, 'id' | 'journal_entry_id'>[];
  status?: string;
  /** Maker-checker: set true only after checker approval */
  approved?: boolean;
}): Promise<{ entry: JournalEntry | null; error: string | null }> {
  if (!isJournalBalanced(input.lines)) {
    return { entry: null, error: 'يجب أن يتساوى مجموع المدين مع مجموع الدائن.' };
  }

  const rulesCheck = await validateJournalAgainstRules(input);
  if (!rulesCheck.ok) {
    return { entry: null, error: rulesCheck.error };
  }

  const companyId = input.companyId || resolveFetchCompanyId();
  if (!companyId) {
    return { entry: null, error: 'تعذر تحديد الشركة الحالية لإنشاء القيد.' };
  }

  const status =
    rulesCheck.requiresApproval && !input.approved
      ? 'بانتظار الاعتماد'
      : input.status || 'مرحّل';

  const entryNumber = await generateEntryNumber();
  const { data: entry, error: entryError } = await supabase
    .from('journal_entries')
    .insert({
      entry_number: entryNumber,
      company_id: companyId,
      entry_date: new Date().toISOString().slice(0, 10),
      description: input.description,
      client_id: input.clientId || null,
      reference_type: input.referenceType || 'manual',
      reference_id: input.referenceId || null,
      cost_center_id: input.costCenterId || null,
      status,
    })
    .select('*')
    .single();

  if (entryError || !entry) {
    return { entry: null, error: entryError?.message || 'تعذر إنشاء القيد.' };
  }

  const lineRows = input.lines.map((line) => ({
    journal_entry_id: entry.id,
    account_id: line.account_id,
    description: line.description || null,
    debit: round2(Number(line.debit || 0)),
    credit: round2(Number(line.credit || 0)),
    cost_center_id: line.cost_center_id || input.costCenterId || null,
  }));

  const { error: linesError } = await supabase.from('journal_entry_lines').insert(lineRows);
  if (linesError) {
    return { entry: null, error: linesError.message };
  }

  return { entry: entry as JournalEntry, error: null };
}

export async function createVoucher(input: {
  type: 'receipt' | 'payment';
  companyId?: string | null;
  clientId?: string | null;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  paymentMethod?: string;
  referenceNumber?: string;
  description: string;
  costCenterId?: string | null;
  status?: string;
  journalEntryId?: string | null;
}): Promise<{ voucher: Voucher | null; error: string | null }> {
  const companyId = input.companyId || resolveFetchCompanyId();
  if (!companyId) {
    return { voucher: null, error: 'تعذر تحديد الشركة الحالية لإنشاء السند.' };
  }
  const voucherNumber = await generateVoucherNumber(input.type);
  const { data, error } = await supabase
    .from('vouchers')
    .insert({
      voucher_number: voucherNumber,
      company_id: companyId,
      voucher_type: input.type,
      voucher_date: new Date().toISOString().slice(0, 10),
      client_id: input.clientId || null,
      amount: round2(input.amount),
      vat_amount: round2(input.vatAmount),
      total_amount: round2(input.totalAmount),
      payment_method: input.paymentMethod || null,
      reference_number: input.referenceNumber || null,
      description: input.description,
      cost_center_id: input.costCenterId || null,
      journal_entry_id: input.journalEntryId || null,
      status: input.status || 'مرحّل',
    })
    .select('*')
    .single();

  if (error) return { voucher: null, error: error.message };
  return { voucher: data as Voucher, error: null };
}

async function findExistingSalesVoucher(clientId: string, quotationNumber: string): Promise<Voucher | null> {
  const companyId = resolveFetchCompanyId();
  if (!companyId) return null;
  const { data } = await supabase
    .from('vouchers')
    .select('*')
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .eq('voucher_type', 'receipt')
    .ilike('description', `%${quotationNumber}%`)
    .order('created_at', { ascending: false })
    .limit(1);

  return (data?.[0] as Voucher) || null;
}

async function findExistingSalesJournal(clientId: string, referenceId: string): Promise<JournalEntry | null> {
  const companyId = resolveFetchCompanyId();
  if (!companyId) return null;
  const { data } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('company_id', companyId)
    .eq('client_id', clientId)
    .eq('reference_id', referenceId)
    .order('created_at', { ascending: false })
    .limit(1);

  return (data?.[0] as JournalEntry) || null;
}

/** Auto-generates receipt voucher + journal entry when sales approves quotation or payment. */
export async function processSalesAccountingAutomation(
  client: ClientRecord,
  updates: Partial<ClientRecord>
): Promise<{ updates: Partial<ClientRecord>; messages: string[]; error: string | null }> {
  const merged = { ...client, ...updates };
  const messages: string[] = [];
  const quotationApproved = ['معتمد', 'بانتظار السداد'].includes(merged.quotation_status || '');
  const subtotal = Number(merged.quotation_amount || 0);
  const vatAmount = Number(merged.vat_amount || 0);
  const totalAmount = Number(merged.total_amount || 0);
  const paidAmount = Number(merged.paid_amount || 0);
  const paymentComplete = paidAmount >= totalAmount && totalAmount > 0;
  const financiallyApproved = isFinancialApproved(merged.financial_status) || paymentComplete;

  if (!quotationApproved || subtotal <= 0 || !merged.quotation_number) {
    return { updates, messages, error: null };
  }

  const companyId = resolveFetchCompanyId();
  if (!companyId) {
    return { updates, messages, error: 'تعذر تحديد الشركة الحالية للأتمتة المحاسبية.' };
  }

  const [cashAccount, revenueAccount, vatAccount, arAccount, costCenterId] = await Promise.all([
    getAccountByCode(DEFAULT_ACCOUNT_CODES.CASH),
    getAccountByCode(DEFAULT_ACCOUNT_CODES.SERVICE_REVENUE),
    getAccountByCode(DEFAULT_ACCOUNT_CODES.VAT_PAYABLE),
    getAccountByCode(DEFAULT_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE),
    getDefaultCostCenterId(),
  ]);

  if (!cashAccount || !revenueAccount || !vatAccount || !arAccount) {
    return {
      updates,
      messages,
      error: 'تعذر الوصول إلى إعدادات الحسابات المحاسبية للشركة. يرجى مراجعة إعدادات المحاسبة.',
    };
  }

  const referenceId = merged.quotation_number;
  let voucherId = merged.receipt_voucher_id || null;
  let journalId = merged.accounting_journal_id || null;

  const existingVoucher = await findExistingSalesVoucher(client.id, referenceId);
  const existingJournal = await findExistingSalesJournal(client.id, referenceId);

  if (!existingVoucher && !voucherId) {
    const voucherResult = await createVoucher({
      type: 'receipt',
      companyId,
      clientId: client.id,
      amount: subtotal,
      vatAmount,
      totalAmount,
      referenceNumber: merged.payment_reference || referenceId,
      description: `سند قبض — عرض ${referenceId} — ${merged.business_name || merged.name}`,
      costCenterId,
      status: financiallyApproved ? 'مرحّل' : 'بانتظار السداد',
    });

    if (voucherResult.error) return { updates, messages, error: voucherResult.error };
    voucherId = voucherResult.voucher?.id || null;
    messages.push('تم إنشاء سند قبض تلقائياً.');
  } else if (financiallyApproved && (existingVoucher || voucherId)) {
    const targetId = existingVoucher?.id || voucherId;
    if (targetId) {
      await supabase.from('vouchers').update({ status: 'مرحّل', total_amount: totalAmount, amount: subtotal, vat_amount: vatAmount }).eq('id', targetId);
      messages.push('تم ترحيل سند القبض.');
    }
  }

  if (!existingJournal && !journalId) {
    const lines = financiallyApproved
      ? [
          { account_id: cashAccount.id, debit: totalAmount, credit: 0, description: 'تحصيل من العميل' },
          { account_id: revenueAccount.id, debit: 0, credit: subtotal, description: 'إيراد خدمات استشارية' },
          { account_id: vatAccount.id, debit: 0, credit: vatAmount, description: 'ضريبة القيمة المضافة 15%' },
        ]
      : [
          { account_id: arAccount.id, debit: totalAmount, credit: 0, description: 'ذمم مدينة — عرض معتمد' },
          { account_id: revenueAccount.id, debit: 0, credit: subtotal, description: 'إيراد مستحق' },
          { account_id: vatAccount.id, debit: 0, credit: vatAmount, description: 'ضريبة مستحقة' },
        ];

    const journalResult = await createJournalEntry({
      companyId,
      description: `قيد تلقائي — ${referenceId}`,
      clientId: client.id,
      referenceType: 'quotation',
      referenceId,
      costCenterId,
      lines,
      status: 'مرحّل',
    });

    if (journalResult.error) return { updates, messages, error: journalResult.error };
    journalId = journalResult.entry?.id || null;
    messages.push('تم إنشاء قيد محاسبي تلقائياً.');

    if (voucherId && journalId) {
      await supabase.from('vouchers').update({ journal_entry_id: journalId }).eq('id', voucherId);
    }
  }

  const nextUpdates: Partial<ClientRecord> = {
    ...updates,
    receipt_voucher_id: voucherId,
    accounting_journal_id: journalId,
  };

  if (financiallyApproved) {
    nextUpdates.financial_status = 'معتمد مالياً';
    if (paidAmount <= 0) nextUpdates.paid_amount = totalAmount;
    messages.push('تم الاعتماد المالي — ستنتقل المعاملة إلى المشاريع.');
  }

  return { updates: nextUpdates, messages, error: null };
}

export function buildTrialBalance(
  accounts: ChartOfAccount[],
  lines: JournalEntryLine[]
): TrialBalanceRow[] {
  const totals = new Map<string, { debit: number; credit: number }>();

  lines.forEach((line) => {
    const current = totals.get(line.account_id) || { debit: 0, credit: 0 };
    current.debit += Number(line.debit || 0);
    current.credit += Number(line.credit || 0);
    totals.set(line.account_id, current);
  });

  return accounts
    .map((account) => {
      const total = totals.get(account.id) || { debit: 0, credit: 0 };
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.account_type,
        debit: round2(total.debit),
        credit: round2(total.credit),
        balance: round2(total.debit - total.credit),
      };
    })
    .filter((row) => row.debit > 0 || row.credit > 0);
}

export function buildIncomeStatement(
  accounts: ChartOfAccount[],
  lines: JournalEntryLine[]
): IncomeStatementSummary {
  const trial = buildTrialBalance(accounts, lines);
  const revenue = trial
    .filter((row) => row.accountType === 'revenue')
    .reduce((sum, row) => sum + row.credit - row.debit, 0);
  const expenses = trial
    .filter((row) => row.accountType === 'expense')
    .reduce((sum, row) => sum + row.debit - row.credit, 0);

  return {
    revenue: round2(revenue),
    expenses: round2(expenses),
    netIncome: round2(revenue - expenses),
  };
}

export function buildVatSummary(vouchers: Voucher[]): VatSummary {
  const receiptVouchers = vouchers.filter((v) => v.voucher_type === 'receipt' && v.status !== 'ملغي');
  return {
    outputVat: round2(receiptVouchers.reduce((sum, v) => sum + Number(v.vat_amount || 0), 0)),
    taxableRevenue: round2(receiptVouchers.reduce((sum, v) => sum + Number(v.amount || 0), 0)),
    voucherCount: receiptVouchers.length,
  };
}

const DONUT_COLORS = ['#1f4d3a', '#b8e986', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6', '#64748b'];

function sumEntryValue(lines: JournalEntryLine[]): number {
  return round2(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
}

function mapEntryToDashboardRow(entry: JournalEntry): DashboardJournalRow {
  return {
    id: entry.id,
    documentNumber: entry.reference_id || entry.entry_number,
    entryType: getJournalEntryTypeLabel(entry.reference_type),
    entryNumber: entry.entry_number,
    entryTitle: entry.description || '—',
    entryValue: sumEntryValue(entry.lines || []),
    entryDate: entry.entry_date,
    entryStatus: entry.status,
  };
}

export async function loadAccountingDashboard(): Promise<AccountingDashboardStats> {
  const [accounts, costCenters, allEntries, vouchers, journalCountRes, voucherCountRes] = await Promise.all([
    fetchAccounts(),
    fetchCostCenters(),
    fetchJournalEntries(40),
    fetchVouchers(undefined, 40),
    supabase.from('journal_entries').select('*', { count: 'exact', head: true }),
    supabase.from('vouchers').select('*', { count: 'exact', head: true }),
  ]);

  // استخدم بنود القيود المحمّلة مع آخر 40 قيد فقط بدل مسح الجدول بالكامل
  const lines = allEntries.flatMap((entry) => entry.lines || []);
  const incomeSummary = buildIncomeStatement(accounts, lines);
  const vatSummary = buildVatSummary(vouchers);

  const costCenterMap = new Map(costCenters.map((center) => [center.id, center.name]));
  const costCenterDistribution = new Map<string, number>();
  const entryTypeDistribution = new Map<string, number>();

  allEntries.forEach((entry) => {
    const centerName = entry.cost_center_id ? costCenterMap.get(entry.cost_center_id) || 'غير محدد' : 'عام';
    costCenterDistribution.set(centerName, (costCenterDistribution.get(centerName) || 0) + 1);
    const typeLabel = getJournalEntryTypeLabel(entry.reference_type);
    entryTypeDistribution.set(typeLabel, (entryTypeDistribution.get(typeLabel) || 0) + 1);
  });

  return {
    journalCount: journalCountRes.count || allEntries.length,
    voucherCount: voucherCountRes.count || vouchers.length,
    accountCount: accounts.length,
    costCenterCount: costCenters.length,
    incomeSummary,
    vatSummary,
    costCenterDistribution: Array.from(costCenterDistribution.entries()).map(([label, value], index) => ({
      label,
      value,
      color: DONUT_COLORS[index % DONUT_COLORS.length],
    })),
    entryTypeDistribution: Array.from(entryTypeDistribution.entries()).map(([label, value]) => ({ label, value })),
    recentEntries: allEntries.slice(0, 10).map(mapEntryToDashboardRow),
  };
}

export function buildAccountTree(accounts: ChartOfAccount[]): (ChartOfAccount & { children: ChartOfAccount[] })[] {
  const map = new Map<string, ChartOfAccount & { children: ChartOfAccount[] }>();
  accounts.forEach((account) => map.set(account.id, { ...account, children: [] }));

  const roots: (ChartOfAccount & { children: ChartOfAccount[] })[] = [];
  map.forEach((account) => {
    if (account.parent_id && map.has(account.parent_id)) {
      map.get(account.parent_id)!.children.push(account);
    } else {
      roots.push(account);
    }
  });

  return roots.sort((a, b) => a.code.localeCompare(b.code));
}
