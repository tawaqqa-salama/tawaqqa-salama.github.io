'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  REFERRAL_CATEGORIES,
  REFERRAL_CLASSIFICATIONS,
  COMMISSION_TYPES,
  COMMISSION_TYPE_LABELS,
  type ReferralCategory,
  type ReferralClassification,
  type CommissionType,
  type ReferralRecord,
  type ReferralStats,
} from '@/lib/types/referrals';
import { buildReferralStats, listReferrals, upsertReferral } from '@/lib/referrals/service';
import type { ClientRecord } from '@/lib/types/client';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { formatCurrency } from '@/lib/format/currency';

type ReferralsDirectoryProps = {
  clients: ClientRecord[];
};

const EMPTY = {
  name: '',
  phone: '',
  category: 'مسوق' as ReferralCategory,
  classification: 'خارجي' as ReferralClassification,
  commission_type: 'percent' as CommissionType,
  commission_value: '5',
  notes: '',
};

export default function ReferralsDirectory({ clients }: ReferralsDirectoryProps) {
  const [rows, setRows] = useState<ReferralRecord[]>([]);
  const [stats, setStats] = useState<ReferralStats[]>([]);
  const [form, setForm] = useState({ ...EMPTY, id: '' as string });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await listReferrals();
    setRows(list);
    setStats(await buildReferralStats(clients));
  }, [clients]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const result = await upsertReferral({
      id: form.id || undefined,
      name: form.name,
      phone: form.phone,
      category: form.category,
      classification: form.classification,
      commission_type: form.commission_type,
      commission_value: Number(form.commission_value || 0),
      notes: form.notes || null,
    });
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setForm({ ...EMPTY, id: '' });
    setMessage('تم حفظ بيانات المحيل.');
    await refresh();
  };

  const edit = (row: ReferralRecord) => {
    setForm({
      id: row.id,
      name: row.name,
      phone: row.phone,
      category: row.category,
      classification: row.classification,
      commission_type: row.commission_type,
      commission_value: String(row.commission_value),
      notes: row.notes || '',
    });
  };

  const statsMap = new Map(stats.map((s) => [s.referral.id, s]));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-bold text-gray-900">
          {form.id ? 'تعديل محيل' : 'إضافة مسوق / مهندس / مقاول'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">الاسم الكامل</span>
            <input
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">الجوال (مفتاح البحث)</span>
            <input
              className="w-full border rounded-xl px-3 py-2.5 text-sm isolate-ltr"
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">التصنيف الوظيفي</span>
            <select
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as ReferralCategory }))}
            >
              {REFERRAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">داخلي / خارجي</span>
            <select
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
              value={form.classification}
              onChange={(e) =>
                setForm((p) => ({ ...p, classification: e.target.value as ReferralClassification }))
              }
            >
              {REFERRAL_CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">نوع العمولة</span>
            <select
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
              value={form.commission_type}
              onChange={(e) =>
                setForm((p) => ({ ...p, commission_type: e.target.value as CommissionType }))
              }
            >
              {COMMISSION_TYPES.map((c) => (
                <option key={c} value={c}>
                  {COMMISSION_TYPE_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">قيمة العمولة</span>
            <input
              className="w-full border rounded-xl px-3 py-2.5 text-sm isolate-ltr"
              dir="ltr"
              value={form.commission_value}
              onChange={(e) => setForm((p) => ({ ...p, commission_value: e.target.value }))}
            />
          </label>
          <label className="text-sm md:col-span-3">
            <span className="text-xs font-semibold text-gray-600 mb-1 block">ملاحظات</span>
            <input
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="px-4 py-2 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-60"
          >
            {busy ? 'جاري الحفظ...' : form.id ? 'تحديث المحيل' : 'حفظ المحيل'}
          </button>
          {form.id ? (
            <button
              type="button"
              onClick={() => setForm({ ...EMPTY, id: '' })}
              className="px-4 py-2 rounded-xl border text-sm font-semibold"
            >
              إلغاء التعديل
            </button>
          ) : null}
        </div>
        {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
      </div>

      <ResponsiveTable className="bg-white rounded-xl border">
        <table className="w-full text-sm text-right">
          <thead className="bg-gray-50 border-b text-gray-600">
            <tr>
              <th className="p-3">المحيل</th>
              <th className="p-3">الجوال</th>
              <th className="p-3">النوع</th>
              <th className="p-3">العمولة</th>
              <th className="p-3">المشاريع</th>
              <th className="p-3">مستحق</th>
              <th className="p-3">مدفوع</th>
              <th className="p-3">الرصيد</th>
              <th className="p-3">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-400">
                  لا يوجد محيلون بعد
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const s = statsMap.get(row.id);
                return (
                  <tr key={row.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-semibold" data-label="المحيل">
                      {row.name}
                      <span className="block text-[11px] text-gray-500 font-normal">
                        {row.classification}
                      </span>
                    </td>
                    <td className="p-3 isolate-ltr" dir="ltr" data-label="الجوال">
                      {row.phone}
                    </td>
                    <td className="p-3" data-label="النوع">
                      {row.category}
                    </td>
                    <td className="p-3" data-label="العمولة">
                      {row.commission_type === 'percent'
                        ? `${row.commission_value}%`
                        : formatCurrency(row.commission_value)}
                    </td>
                    <td className="p-3" data-label="المشاريع">
                      {s?.projects_count ?? 0}
                    </td>
                    <td className="p-3" data-label="مستحق">
                      {formatCurrency(s?.earned_total || 0)}
                    </td>
                    <td className="p-3" data-label="مدفوع">
                      {formatCurrency(s?.paid_total || 0)}
                    </td>
                    <td className="p-3 font-semibold" data-label="الرصيد">
                      {formatCurrency(s?.balance || 0)}
                    </td>
                    <td className="p-3" data-label="إجراء">
                      <button
                        type="button"
                        onClick={() => edit(row)}
                        className="text-xs font-semibold text-[#1f4d3a]"
                      >
                        تعديل
                      </button>
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
