'use client';

import { useEffect, useState } from 'react';
import {
  fetchBankAccounts,
  fetchBankTransactions,
  findMatchCandidates,
  importBankTransactions,
  parseBankStatementCsv,
  reconcileTransaction,
  type BankAccountRow,
  type BankTxnRow,
  type MatchCandidate,
} from '@/lib/finance/bank-reconciliation';
import { formatCurrency } from '@/lib/format/currency';

export default function BankReconciliationPanel() {
  const [banks, setBanks] = useState<BankAccountRow[]>([]);
  const [bankId, setBankId] = useState('');
  const [txns, setTxns] = useState<BankTxnRow[]>([]);
  const [csv, setCsv] = useState('date,description,amount\n2026-07-01,Customer receipt,115000\n2026-07-02,Bank fee,-25\n');
  const [message, setMessage] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, MatchCandidate[]>>({});
  const [busy, setBusy] = useState(false);

  const reload = async (id: string) => {
    const list = await fetchBankTransactions(id);
    setTxns(list);
  };

  useEffect(() => {
    void fetchBankAccounts().then((list) => {
      setBanks(list);
      if (list[0]) {
        setBankId(list[0].id);
        void reload(list[0].id);
      }
    });
  }, []);

  const onImport = async () => {
    if (!bankId) return;
    setBusy(true);
    setMessage(null);
    const drafts = parseBankStatementCsv(csv);
    const res = await importBankTransactions(bankId, drafts);
    setBusy(false);
    setMessage(
      res.ok
        ? `تم استيراد ${res.imported} حركة`
        : res.error || 'فشل الاستيراد'
    );
    if (res.ok) await reload(bankId);
  };

  const onSuggest = async (txn: BankTxnRow) => {
    const list = await findMatchCandidates(txn);
    setMatches((prev) => ({ ...prev, [txn.id]: list }));
  };

  const onReconcile = async (txnId: string, journalId: string) => {
    const res = await reconcileTransaction(txnId, journalId);
    setMessage(res.ok ? 'تمت المطابقة والتسوية' : res.error || 'فشل');
    if (res.ok && bankId) await reload(bankId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <span className="block text-xs text-gray-500 mb-1">الحساب البنكي</span>
          <select
            className="border rounded-lg px-3 py-2 bg-white min-w-[220px]"
            value={bankId}
            onChange={(e) => {
              setBankId(e.target.value);
              void reload(e.target.value);
            }}
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-2">
        <h3 className="font-bold text-sm">استيراد كشف حساب (CSV)</h3>
        <p className="text-xs text-gray-500">الأعمدة: date, description, amount [, type]</p>
        <textarea
          className="w-full border rounded-lg p-2 text-xs font-mono min-h-[100px]"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !bankId}
          onClick={() => void onImport()}
          className="px-3 py-1.5 rounded-lg bg-[#1f4d3a] text-white text-xs font-semibold disabled:opacity-50"
        >
          استيراد الحركات
        </button>
      </div>

      {message ? (
        <div className="text-xs rounded-lg border px-3 py-2 bg-slate-50">{message}</div>
      ) : null}

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-start p-2">التاريخ</th>
              <th className="text-start p-2">الوصف</th>
              <th className="text-start p-2">المبلغ</th>
              <th className="text-start p-2">الحالة</th>
              <th className="text-start p-2">مطابقة ذكية</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.id} className="border-t align-top">
                <td className="p-2 whitespace-nowrap">{t.txn_date}</td>
                <td className="p-2">{t.description}</td>
                <td className="p-2 tabular-nums font-medium">{formatCurrency(t.amount)}</td>
                <td className="p-2 text-xs">
                  {t.is_reconciled ? (
                    <span className="text-emerald-700 font-semibold">مسوّى</span>
                  ) : (
                    <span className="text-amber-700">غير مسوّى</span>
                  )}
                </td>
                <td className="p-2 space-y-1">
                  {!t.is_reconciled ? (
                    <button
                      type="button"
                      className="text-xs text-blue-700 underline"
                      onClick={() => void onSuggest(t)}
                    >
                      اقتراح مطابقة
                    </button>
                  ) : null}
                  {(matches[t.id] || []).map((m) => (
                    <div key={m.journalId} className="text-[11px] border rounded-lg p-1.5 bg-emerald-50/50">
                      <div>
                        {m.entryNumber} · {formatCurrency(m.amount)} · درجة {m.score}
                      </div>
                      <div className="text-gray-500">{m.reasonAr}</div>
                      <button
                        type="button"
                        className="mt-1 text-emerald-800 font-semibold"
                        onClick={() => void onReconcile(t.id, m.journalId)}
                      >
                        تأكيد التسوية
                      </button>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
            {!txns.length ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-400 text-xs">
                  لا توجد حركات — استورد كشف حساب
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
