'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClientRecord } from '@/lib/types/client';
import {
  COMMISSION_STATUS_LABELS,
  type CommissionEntry,
  type ReferralRecord,
  type ReferralStats,
} from '@/lib/types/referrals';
import {
  accrueCommissionForClient,
  buildReferralStats,
  listCommissionEntries,
  listReferrals,
  markCommissionPaid,
} from '@/lib/referrals/service';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { formatCurrency } from '@/lib/format/currency';
import { isFinancialApproved } from '@/lib/business/workflow-stages';

type CommissionLedgerProps = {
  clients: ClientRecord[];
};

export default function CommissionLedger({ clients }: CommissionLedgerProps) {
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [stats, setStats] = useState<ReferralStats[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [refs, rows, st] = await Promise.all([
      listReferrals(),
      listCommissionEntries(),
      buildReferralStats(clients),
    ]);
    setReferrals(refs);
    setEntries(rows);
    setStats(st);
  }, [clients]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const referralMap = useMemo(() => new Map(referrals.map((r) => [r.id, r])), [referrals]);

  const syncAccruals = async () => {
    setMessage(null);
    let created = 0;
    for (const client of clients) {
      if (!client.referrer_id) continue;
      if (!isFinancialApproved(client.financial_status || '')) continue;
      const before = entries.find((e) => e.client_id === client.id && e.status !== 'cancelled');
      const entry = await accrueCommissionForClient(client, referralMap.get(client.referrer_id));
      if (entry && (!before || before.id !== entry.id)) created += 1;
    }
    await refresh();
    setMessage(created > 0 ? `تم استحقاق ${created} عمولة جديدة.` : 'لا توجد عمولات جديدة للاستحقاق.');
  };

  const pay = async (id: string) => {
    setBusyId(id);
    await markCommissionPaid(id);
    setBusyId(null);
    await refresh();
  };

  const totals = useMemo(() => {
    const earned = stats.reduce((s, r) => s + r.earned_total, 0);
    const paid = stats.reduce((s, r) => s + r.paid_total, 0);
    return { earned, paid, balance: earned - paid };
  }, [stats]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">نظام العمولات</h2>
          <p className="text-sm text-gray-500">استحقاق تلقائي عند الاعتماد المالي للمشاريع المرتبطة بمحيل</p>
        </div>
        <button
          type="button"
          onClick={() => void syncAccruals()}
          className="px-4 py-2 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold"
        >
          مزامنة الاستحقاقات
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="إجمالي المستحق" value={formatCurrency(totals.earned)} />
        <StatCard label="إجمالي المدفوع" value={formatCurrency(totals.paid)} />
        <StatCard label="الرصيد المتبقي" value={formatCurrency(totals.balance)} accent />
      </div>

      {message ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      <ResponsiveTable className="bg-white rounded-xl border">
        <table className="w-full text-sm text-right">
          <thead className="bg-gray-50 border-b text-gray-600">
            <tr>
              <th className="p-3">المحيل</th>
              <th className="p-3">المشروع</th>
              <th className="p-3">أساس الحساب</th>
              <th className="p-3">العمولة</th>
              <th className="p-3">المستحق</th>
              <th className="p-3">المدفوع</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-400">
                  لا توجد قيود عمولة بعد — اربط محيلاً بالمشروع ثم اعتمد مالياً أو اضغط مزامنة.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const ref = referralMap.get(entry.referral_id);
                return (
                  <tr key={entry.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-semibold" data-label="المحيل">
                      {ref?.name || entry.referral_id}
                    </td>
                    <td className="p-3" data-label="المشروع">
                      {entry.project_label || '—'}
                    </td>
                    <td className="p-3" data-label="أساس الحساب">
                      {formatCurrency(entry.basis_amount)}
                    </td>
                    <td className="p-3" data-label="العمولة">
                      {entry.commission_type === 'percent'
                        ? `${entry.commission_rate}%`
                        : formatCurrency(entry.commission_rate)}
                    </td>
                    <td className="p-3" data-label="المستحق">
                      {formatCurrency(entry.earned_amount)}
                    </td>
                    <td className="p-3" data-label="المدفوع">
                      {formatCurrency(entry.paid_amount)}
                    </td>
                    <td className="p-3" data-label="الحالة">
                      {COMMISSION_STATUS_LABELS[entry.status]}
                    </td>
                    <td className="p-3" data-label="إجراء">
                      {entry.status !== 'paid' && entry.status !== 'cancelled' ? (
                        <button
                          type="button"
                          disabled={busyId === entry.id}
                          onClick={() => void pay(entry.id)}
                          className="text-xs font-semibold text-emerald-700 disabled:opacity-50"
                        >
                          {busyId === entry.id ? '...' : 'تسديد كامل'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ResponsiveTable>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? 'bg-[#eef6f1] border-[#1f4d3a]/20' : 'bg-white border-gray-200'
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
