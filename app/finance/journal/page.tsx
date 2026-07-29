'use client';

import { Fragment, useEffect, useState } from 'react';
import { fetchJournalEntries } from '@/lib/business/accounting-service';
import JournalEntryModal from '@/components/finance/JournalEntryModal';
import PageHeader from '@/components/shared/PageHeader';
import { formatCurrency, formatDate } from '@/lib/format/currency';
import type { JournalEntry } from '@/lib/types/accounting';

export default function JournalEntriesPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchJournalEntries(100)
      .then(setEntries)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="القيود اليومية"
        description="إنشاء وإدارة القيود المحاسبية — مدين / دائن متوازنان"
        action={
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold">
            + قيد جديد
          </button>
        }
      />

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <table className="w-full text-right text-sm">
          <thead className="bg-gray-50 border-b text-gray-600">
            <tr>
              <th className="p-4">رقم القيد</th>
              <th className="p-4">التاريخ</th>
              <th className="p-4">الوصف</th>
              <th className="p-4">المرجع</th>
              <th className="p-4">الحالة</th>
              <th className="p-4">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">جاري التحميل...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد قيود محاسبية</td></tr>
            ) : (
              entries.map((entry) => (
                <Fragment key={entry.id}>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="p-4 font-mono text-blue-600">{entry.entry_number}</td>
                    <td className="p-4">{formatDate(entry.entry_date)}</td>
                    <td className="p-4">{entry.description || '—'}</td>
                    <td className="p-4">{entry.reference_id || '—'}</td>
                    <td className="p-4">{entry.status}</td>
                    <td className="p-4">
                      <button
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        className="text-xs px-2 py-1 bg-gray-100 rounded-lg"
                      >
                        {expandedId === entry.id ? 'إخفاء' : 'عرض البنود'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === entry.id && entry.lines && entry.lines.length > 0 && (
                    <tr className="bg-gray-50">
                      <td colSpan={6} className="p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="pb-2">الحساب</th>
                              <th className="pb-2">البيان</th>
                              <th className="pb-2">مدين</th>
                              <th className="pb-2">دائن</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.lines.map((line) => (
                              <tr key={line.id} className="border-t">
                                <td className="py-2 font-mono">{line.account_id.slice(0, 8)}...</td>
                                <td className="py-2">{line.description || '—'}</td>
                                <td className="py-2 font-mono">{formatCurrency(line.debit)}</td>
                                <td className="py-2 font-mono">{formatCurrency(line.credit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && <JournalEntryModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}
