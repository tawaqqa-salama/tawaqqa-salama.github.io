/**
 * Bank reconciliation — import statement lines and smart-match to vouchers/journals.
 */

import { isDemoMode, requireConfiguredSupabase, supabase } from '@/lib/supabase';
import { isDemoAllowed } from '@/lib/runtime/mode';

export type BankTxnDraft = {
  txnDate: string;
  description: string;
  amount: number;
  txnType?: 'deposit' | 'withdrawal' | 'transfer' | 'fee' | 'cheque';
  reference?: string;
};

export type BankAccountRow = {
  id: string;
  code: string;
  name: string;
  bank_name: string | null;
  iban: string | null;
  currency_code: string;
  opening_balance: number;
  is_cash: boolean;
};

export type BankTxnRow = {
  id: string;
  bank_account_id: string;
  txn_date: string;
  description: string | null;
  amount: number;
  txn_type: string;
  matched_journal_id: string | null;
  is_reconciled: boolean;
  import_batch_id: string | null;
};

export type MatchCandidate = {
  journalId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  amount: number;
  score: number;
  reasonAr: string;
};

export async function fetchBankAccounts(): Promise<BankAccountRow[]> {
  if (isDemoMode) {
    if (!isDemoAllowed()) return [];
    return demoBanks();
  }
  const { data, error } = await supabase.from('acc_bank_accounts').select('*').eq('is_active', true);
  if (error) return [];
  return (data || []) as BankAccountRow[];
}

export async function fetchBankTransactions(bankAccountId: string): Promise<BankTxnRow[]> {
  if (isDemoMode) {
    if (!isDemoAllowed()) return [];
    return demoTxns(bankAccountId);
  }
  const { data, error } = await supabase
    .from('acc_bank_transactions')
    .select('*')
    .eq('bank_account_id', bankAccountId)
    .order('txn_date', { ascending: false })
    .limit(200);
  if (error) return [];
  return (data || []) as BankTxnRow[];
}

/** Parse simple CSV: date,description,amount[,type] */
export function parseBankStatementCsv(csv: string): BankTxnDraft[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const start = /date|تاريخ/i.test(lines[0]) ? 1 : 0;
  const out: BankTxnDraft[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 3) continue;
    const amount = Number(String(cols[2]).replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount === 0) continue;
    out.push({
      txnDate: normalizeDate(cols[0]),
      description: cols[1] || '',
      amount,
      txnType: amount >= 0 ? 'deposit' : 'withdrawal',
      reference: cols[3] || undefined,
    });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) {
      result.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return new Date().toISOString().slice(0, 10);
}

export async function importBankTransactions(
  bankAccountId: string,
  drafts: BankTxnDraft[],
  batchId?: string
): Promise<{ ok: boolean; imported: number; error?: string }> {
  if (!drafts.length) return { ok: false, imported: 0, error: 'لا توجد حركات للاستيراد' };
  const batch = batchId || `IMP-${Date.now()}`;

  const liveErr = requireConfiguredSupabase('استيراد كشف البنك');
  if (liveErr) return { ok: false, imported: 0, error: liveErr };

  if (isDemoMode) {
    if (!isDemoAllowed()) {
      return { ok: false, imported: 0, error: 'الوضع التجريبي غير مسموح في الإنتاج' };
    }
    return { ok: true, imported: drafts.length };
  }

  const rows = drafts.map((d) => ({
    bank_account_id: bankAccountId,
    txn_date: d.txnDate,
    description: d.description,
    amount: d.amount,
    txn_type: d.txnType || (d.amount >= 0 ? 'deposit' : 'withdrawal'),
    is_reconciled: false,
    import_batch_id: batch,
  }));

  const { error } = await supabase.from('acc_bank_transactions').insert(rows);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { ok: false, imported: 0, error: 'جدول acc_bank_transactions غير موجود — طبّق 027 عبر db:apply-dds' };
    }
    return { ok: false, imported: 0, error: error.message };
  }
  return { ok: true, imported: rows.length };
}

export function scoreMatch(
  txn: Pick<BankTxnRow, 'txn_date' | 'amount' | 'description'>,
  journal: { id: string; entry_number: string; entry_date: string; description: string | null; amount: number }
): MatchCandidate | null {
  const txnAbs = Math.abs(Number(txn.amount));
  const jAbs = Math.abs(Number(journal.amount));
  if (txnAbs <= 0 || jAbs <= 0) return null;

  let score = 0;
  const reasons: string[] = [];

  if (Math.abs(txnAbs - jAbs) < 0.05) {
    score += 60;
    reasons.push('تطابق المبلغ');
  } else if (Math.abs(txnAbs - jAbs) / txnAbs < 0.02) {
    score += 40;
    reasons.push('مبلغ قريب');
  } else {
    return null;
  }

  const dayDiff = Math.abs(
    (new Date(txn.txn_date).getTime() - new Date(journal.entry_date).getTime()) / 86400000
  );
  if (dayDiff <= 1) {
    score += 25;
    reasons.push('تاريخ متقارب');
  } else if (dayDiff <= 7) {
    score += 10;
    reasons.push('خلال أسبوع');
  }

  const td = (txn.description || '').toLowerCase();
  const jd = (journal.description || '').toLowerCase();
  if (td && jd && (td.includes(jd.slice(0, 8)) || jd.includes(td.slice(0, 8)))) {
    score += 15;
    reasons.push('تشابه الوصف');
  }

  if (score < 60) return null;
  return {
    journalId: journal.id,
    entryNumber: journal.entry_number,
    entryDate: journal.entry_date,
    description: journal.description || '',
    amount: journal.amount,
    score,
    reasonAr: reasons.join(' · '),
  };
}

export async function findMatchCandidates(txn: BankTxnRow): Promise<MatchCandidate[]> {
  const abs = Math.abs(Number(txn.amount));
  if (isDemoMode) {
    return [
      {
        journalId: 'demo-je-1',
        entryNumber: 'JE-DEMO-1',
        entryDate: txn.txn_date,
        description: 'سند قبض تجريبي',
        amount: abs,
        score: 85,
        reasonAr: 'تطابق المبلغ · تاريخ متقارب',
      },
    ].filter((c) => scoreMatch(txn, {
      id: c.journalId,
      entry_number: c.entryNumber,
      entry_date: c.entryDate,
      description: c.description,
      amount: c.amount,
    }));
  }

  const from = new Date(txn.txn_date);
  from.setDate(from.getDate() - 14);
  const to = new Date(txn.txn_date);
  to.setDate(to.getDate() + 14);

  const { data: entries } = await supabase
    .from('journal_entries')
    .select('id, entry_number, entry_date, description, journal_entry_lines(debit, credit)')
    .gte('entry_date', from.toISOString().slice(0, 10))
    .lte('entry_date', to.toISOString().slice(0, 10))
    .is('deleted_at', null)
    .limit(80);

  const candidates: MatchCandidate[] = [];
  for (const e of entries || []) {
    const lines = (e.journal_entry_lines || []) as { debit?: number; credit?: number }[];
    const amount = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const match = scoreMatch(txn, {
      id: e.id,
      entry_number: e.entry_number,
      entry_date: e.entry_date,
      description: e.description,
      amount,
    });
    if (match) candidates.push(match);
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function reconcileTransaction(
  txnId: string,
  journalId: string
): Promise<{ ok: boolean; error?: string }> {
  const liveErr = requireConfiguredSupabase('تسوية بنكية');
  if (liveErr) return { ok: false, error: liveErr };
  if (isDemoMode) {
    if (!isDemoAllowed()) return { ok: false, error: 'الوضع التجريبي غير مسموح في الإنتاج' };
    return { ok: true };
  }
  const { error } = await supabase
    .from('acc_bank_transactions')
    .update({
      matched_journal_id: journalId,
      is_reconciled: true,
    })
    .eq('id', txnId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function demoBanks(): BankAccountRow[] {
  return [
    {
      id: 'demo-bank-1',
      code: 'BNK-01',
      name: 'البنك الأهلي — جاري',
      bank_name: 'SNB',
      iban: 'SA0000000000000000000000',
      currency_code: 'SAR',
      opening_balance: 520000,
      is_cash: false,
    },
  ];
}

function demoTxns(bankAccountId: string): BankTxnRow[] {
  return [
    {
      id: 'demo-txn-1',
      bank_account_id: bankAccountId,
      txn_date: new Date().toISOString().slice(0, 10),
      description: 'تحويل عميل — فاتورة استشارات',
      amount: 115000,
      txn_type: 'deposit',
      matched_journal_id: null,
      is_reconciled: false,
      import_batch_id: 'DEMO',
    },
    {
      id: 'demo-txn-2',
      bank_account_id: bankAccountId,
      txn_date: new Date().toISOString().slice(0, 10),
      description: 'رسوم بنكية',
      amount: -25,
      txn_type: 'fee',
      matched_journal_id: null,
      is_reconciled: false,
      import_batch_id: 'DEMO',
    },
  ];
}
