'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/shared/PageHeader';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { useAuth } from '@/lib/auth/AuthProvider';
import { fetchActivityLogs } from '@/lib/activity/logger';
import {
  ACTIVITY_ACTION_LABELS,
  moduleLabel,
  roleLabel,
} from '@/lib/activity/labels';
import {
  ACTIVITY_ACTION_TYPES,
  type ActivityActionType,
  type ActivityLog,
} from '@/lib/activity/types';
import { formatDate } from '@/lib/format/currency';

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ar-SA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ActivityLogPage() {
  const { canManageStaff, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState<ActivityActionType | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = async () => {
    setLoading(true);
    const rows = await fetchActivityLogs(400);
    setLogs(rows);
    setLoading(false);
  };

  useEffect(() => {
    if (!canManageStaff) return;
    void load();
  }, [canManageStaff]);

  const filtered = useMemo(() => {
    return logs.filter((row) => {
      if (userFilter.trim()) {
        const q = userFilter.trim().toLowerCase();
        const hay = `${row.user_name} ${row.user_role}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (actionFilter && row.action_type !== actionFilter) return false;
      const day = String(row.created_at || '').slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [logs, userFilter, actionFilter, dateFrom, dateTo]);

  if (authLoading) {
    return <p className="text-sm text-gray-500 p-4">جاري التحقق من الصلاحيات...</p>;
  }

  if (!canManageStaff) {
    return (
      <div className="bg-white border rounded-xl p-6">
        <p className="font-bold text-gray-800 mb-2">غير مصرح</p>
        <p className="text-sm text-gray-500 mb-4">سجل النشاطات متاح لمدير النظام فقط.</p>
        <Link href="/settings" className="text-sm font-semibold text-[#635bdb] hover:underline">
          ← رجوع للإعدادات
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="سجل النشاطات"
        description="تتبع دخول المستخدمين وتصفح الصفحات وعمليات الإنشاء والتعديل والطباعة."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="text-sm font-semibold px-3 py-2 rounded-xl border bg-white hover:bg-gray-50"
            >
              تحديث
            </button>
            <Link href="/settings" className="text-sm font-semibold text-[#635bdb] hover:underline">
              ← رجوع
            </Link>
          </div>
        }
      />

      <div className="bg-white border rounded-xl p-3">
        <div className="date-range-bar">
          <label className="date-field">
            <span>اسم الموظف</span>
            <input
              type="text"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              placeholder="بحث بالاسم أو الدور"
              className="!direction-rtl"
              style={{
                display: 'block',
                width: '100%',
                minHeight: 42,
                border: '1px solid #ccc',
                padding: 8,
                borderRadius: 6,
                background: '#fff',
              }}
            />
          </label>
          <label className="date-field">
            <span>نوع الإجراء</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter((e.target.value || '') as ActivityActionType | '')}
              style={{
                display: 'block',
                width: '100%',
                minHeight: 42,
                border: '1px solid #ccc',
                padding: 8,
                borderRadius: 6,
                background: '#fff',
              }}
            >
              <option value="">الكل</option>
              {ACTIVITY_ACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_ACTION_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="date-field">
            <span>من تاريخ</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="date-field">
            <span>إلى تاريخ</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          {(userFilter || actionFilter || dateFrom || dateTo) && (
            <button
              type="button"
              className="date-clear"
              onClick={() => {
                setUserFilter('');
                setActionFilter('');
                setDateFrom('');
                setDateTo('');
              }}
            >
              مسح الفلاتر
            </button>
          )}
        </div>
      </div>

      <ResponsiveTable className="bg-white rounded-xl border">
        <table className="w-full text-right text-sm table-as-cards">
          <thead className="bg-gray-50 border-b text-xs text-gray-500">
            <tr>
              <th className="p-3">اسم الموظف</th>
              <th className="p-3">نوع الإجراء</th>
              <th className="p-3">القسم / الصفحة</th>
              <th className="p-3">التفاصيل</th>
              <th className="p-3">الوقت والتاريخ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">
                  جاري التحميل...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">
                  لا توجد نشاطات مطابقة
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b hover:bg-gray-50 align-top">
                  <td className="p-3" data-label="اسم الموظف">
                    <div className="font-semibold text-gray-800">{row.user_name || '—'}</div>
                    <div className="text-[11px] text-gray-400">{roleLabel(row.user_role)}</div>
                  </td>
                  <td className="p-3" data-label="نوع الإجراء">
                    <span className="inline-flex text-xs font-semibold px-2 py-1 rounded-lg bg-[#eef6f1] text-[#635bdb]">
                      {ACTIVITY_ACTION_LABELS[row.action_type] || row.action_type}
                    </span>
                  </td>
                  <td className="p-3" data-label="القسم / الصفحة">
                    <div className="font-medium">{moduleLabel(row.module)}</div>
                    <div className="text-[11px] text-gray-400 dir-ltr text-left" dir="ltr">
                      {row.page_url || '—'}
                    </div>
                  </td>
                  <td className="p-3 max-w-md" data-label="التفاصيل">
                    <p className="text-gray-700 leading-relaxed">{row.details}</p>
                  </td>
                  <td className="p-3 whitespace-nowrap" data-label="الوقت والتاريخ">
                    <div className="font-mono text-xs" dir="ltr">
                      {formatDateTime(row.created_at)}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{formatDate(row.created_at)}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ResponsiveTable>

      <p className="text-xs text-gray-400">
        يُعرض أحدث {filtered.length} سجل بعد الفلترة. نفّذ SQL{' '}
        <code className="bg-gray-100 px-1 rounded">020_activity_logs.sql</code> في Supabase للمزامنة الكاملة.
      </p>
    </div>
  );
}
