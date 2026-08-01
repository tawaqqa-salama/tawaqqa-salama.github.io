'use client';

import { useState } from 'react';
import type { ClientRecord } from '@/lib/types/client';

type SmartInspectionFormProps = {
  clients: ClientRecord[];
  onOpenProject?: (client: ClientRecord) => void;
};

/** نموذج ديناميكي للمعاينة الميدانية — يجهّز تقريراً سريعاً قبل فتح ملف المشروع */
export default function SmartInspectionForm({ clients, onOpenProject }: SmartInspectionFormProps) {
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [accessOk, setAccessOk] = useState(true);
  const [exitsClear, setExitsClear] = useState(true);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const selected = clients.find((c) => c.id === clientId) || null;

  const submit = () => {
    if (!selected) return;
    const summary = [
      `معاينة ${selected.business_name || selected.name}`,
      `التاريخ: ${visitDate}`,
      `سهولة الوصول: ${accessOk ? 'نعم' : 'لا'}`,
      `مخارج واضحة: ${exitsClear ? 'نعم' : 'لا'}`,
      notes ? `ملاحظات: ${notes}` : '',
    ]
      .filter(Boolean)
      .join(' — ');

    if (typeof window !== 'undefined') {
      const key = 'tawaqqa_field_inspections_v1';
      const prev = JSON.parse(localStorage.getItem(key) || '[]') as unknown[];
      prev.unshift({
        id: `insp-${Date.now()}`,
        clientId: selected.id,
        visitDate,
        accessOk,
        exitsClear,
        notes,
        summary,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(prev.slice(0, 100)));
    }

    setSaved(summary);
    void import('@/lib/activity/logger').then(({ logActivity }) =>
      logActivity({
        actionType: 'CREATE',
        module: 'projects',
        pageUrl: '/projects',
        details: `تم تسجيل معاينة ميدانية: ${selected.business_name || selected.name}`,
      })
    );
  };

  return (
    <div className="rounded-xl border border-[var(--erp-border)] bg-white p-4 space-y-4">
      <div>
        <h2 className="text-lg font-bold">خانة المعاينة الهندسية</h2>
        <p className="text-sm text-[var(--erp-muted)] mt-1">
          نموذج ميداني سريع — ثم أكمل التقرير الفني من ملف المشروع.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">المشروع</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name || c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">تاريخ المعاينة</span>
          <input
            type="date"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={accessOk} onChange={(e) => setAccessOk(e.target.checked)} />
          سهولة الوصول للموقع
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={exitsClear} onChange={(e) => setExitsClear(e.target.checked)} />
          مخارج الطوارئ واضحة
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-xs font-semibold text-gray-600 mb-1 block">ملاحظات ميدانية</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full border rounded-xl px-3 py-2.5 text-sm"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!selected}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          حفظ المعاينة
        </button>
        {selected && onOpenProject ? (
          <button
            type="button"
            onClick={() => onOpenProject(selected)}
            className="px-4 py-2.5 rounded-xl border text-sm font-semibold"
          >
            فتح ملف المشروع الكامل
          </button>
        ) : null}
      </div>

      {saved ? (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          {saved}
        </p>
      ) : null}
    </div>
  );
}
