'use client';

import { useEffect, useState } from 'react';
import {
  REFERRAL_CATEGORIES,
  REFERRAL_CLASSIFICATIONS,
  COMMISSION_TYPES,
  COMMISSION_TYPE_LABELS,
  type ReferralCategory,
  type ReferralClassification,
  type CommissionType,
  type ReferralRecord,
} from '@/lib/types/referrals';
import { searchReferrals, upsertReferral } from '@/lib/referrals/service';

type ReferralPickerProps = {
  value: string;
  onChange: (referralId: string, referral?: ReferralRecord | null) => void;
  label?: string;
};

export default function ReferralPicker({
  value,
  onChange,
  label = 'من طرف مين جاء؟ (المحيل)',
}: ReferralPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReferralRecord[]>([]);
  const [selected, setSelected] = useState<ReferralRecord | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quick, setQuick] = useState({
    name: '',
    phone: '',
    category: 'مسوق' as ReferralCategory,
    classification: 'خارجي' as ReferralClassification,
    commission_type: 'percent' as CommissionType,
    commission_value: '5',
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await searchReferrals(query);
      if (!cancelled) setResults(rows.slice(0, 8));
      if (value && !selected) {
        const hit = rows.find((r) => r.id === value) || (await searchReferrals('')).find((r) => r.id === value);
        if (hit && !cancelled) setSelected(hit);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, value, selected]);

  const pick = (row: ReferralRecord) => {
    setSelected(row);
    setQuery('');
    setShowQuickAdd(false);
    onChange(row.id, row);
  };

  const clear = () => {
    setSelected(null);
    onChange('', null);
  };

  const saveQuick = async () => {
    setBusy(true);
    setError(null);
    const result = await upsertReferral({
      name: quick.name,
      phone: quick.phone,
      category: quick.category,
      classification: quick.classification,
      commission_type: quick.commission_type,
      commission_value: Number(quick.commission_value || 0),
    });
    setBusy(false);
    if (result.error || !result.referral) {
      setError(result.error || 'تعذر الحفظ');
      return;
    }
    pick(result.referral);
    setQuick({
      name: '',
      phone: '',
      category: 'مسوق',
      classification: 'خارجي',
      commission_type: 'percent',
      commission_value: '5',
    });
  };

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-amber-900">{label}</p>
        {selected ? (
          <button type="button" onClick={clear} className="text-[11px] text-rose-700 font-semibold">
            إزالة
          </button>
        ) : null}
      </div>

      {selected ? (
        <div className="rounded-lg bg-white border border-amber-100 px-3 py-2 text-sm">
          <p className="font-semibold text-gray-900">{selected.name}</p>
          <p className="text-xs text-gray-500 mt-0.5 isolate-ltr" dir="ltr">
            {selected.phone} · {selected.category} · {selected.classification} ·{' '}
            {selected.commission_type === 'percent'
              ? `${selected.commission_value}%`
              : `${selected.commission_value} ر.س`}
          </p>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الجوال..."
            className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white"
          />
          {results.length > 0 && query.trim() ? (
            <ul className="bg-white border rounded-xl divide-y max-h-40 overflow-y-auto">
              {results.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => pick(row)}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-amber-50"
                  >
                    <span className="font-semibold block">{row.name}</span>
                    <span className="text-xs text-gray-500 isolate-ltr" dir="ltr">
                      {row.phone} · {row.category}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() => setShowQuickAdd((v) => !v)}
            className="text-xs font-semibold text-[#1f4d3a]"
          >
            {showQuickAdd ? 'إخفاء الإضافة السريعة' : '+ إضافة محيل جديد بسرعة'}
          </button>
        </>
      )}

      {showQuickAdd && !selected ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white border rounded-xl p-3">
          <input
            className="border rounded-lg px-2.5 py-2 text-sm"
            placeholder="الاسم الكامل"
            value={quick.name}
            onChange={(e) => setQuick((p) => ({ ...p, name: e.target.value }))}
          />
          <input
            className="border rounded-lg px-2.5 py-2 text-sm isolate-ltr"
            dir="ltr"
            placeholder="رقم الجوال"
            value={quick.phone}
            onChange={(e) => setQuick((p) => ({ ...p, phone: e.target.value }))}
          />
          <select
            className="border rounded-lg px-2.5 py-2 text-sm"
            value={quick.category}
            onChange={(e) => setQuick((p) => ({ ...p, category: e.target.value as ReferralCategory }))}
          >
            {REFERRAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="border rounded-lg px-2.5 py-2 text-sm"
            value={quick.classification}
            onChange={(e) =>
              setQuick((p) => ({ ...p, classification: e.target.value as ReferralClassification }))
            }
          >
            {REFERRAL_CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="border rounded-lg px-2.5 py-2 text-sm"
            value={quick.commission_type}
            onChange={(e) => setQuick((p) => ({ ...p, commission_type: e.target.value as CommissionType }))}
          >
            {COMMISSION_TYPES.map((c) => (
              <option key={c} value={c}>
                {COMMISSION_TYPE_LABELS[c]}
              </option>
            ))}
          </select>
          <input
            className="border rounded-lg px-2.5 py-2 text-sm isolate-ltr"
            dir="ltr"
            placeholder={quick.commission_type === 'percent' ? 'النسبة %' : 'المبلغ ر.س'}
            value={quick.commission_value}
            onChange={(e) => setQuick((p) => ({ ...p, commission_value: e.target.value }))}
          />
          {error ? <p className="sm:col-span-2 text-xs text-rose-700">{error}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveQuick()}
            className="sm:col-span-2 px-3 py-2 rounded-lg bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-60"
          >
            {busy ? 'جاري الحفظ...' : 'حفظ وربط المحيل'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
