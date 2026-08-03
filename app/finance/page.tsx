'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadAccountingDashboard } from '@/lib/business/accounting-service';
import OmniStatCard from '@/components/finance/OmniStatCard';
import DonutChart from '@/components/finance/DonutChart';
import BarChartPanel, { IncomeBarChart } from '@/components/finance/BarChartPanel';
import ErpCard from '@/components/ui/ErpCard';
import { formatCurrency, formatDate } from '@/lib/format/currency';
import { VAT_RATE } from '@/lib/constants/clients';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { AccountingDashboardStats } from '@/lib/types/accounting';

function StatusBadge({ status }: { status: string }) {
  const posted = status === 'مرحّل';
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        posted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      {status}
    </span>
  );
}

export default function FinanceDashboardPage() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<AccountingDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccountingDashboard()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center text-gray-400 py-20">{t('finance.page.dashboardLoading')}</div>;
  }

  if (!stats) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('finance.page.dashboard')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('finance.page.dashboardSubtitle')}</p>
        </div>
        <Link
          href="/finance/journal"
          className="inline-flex items-center justify-center px-4 py-2 bg-[#1f4d3a] text-white rounded-lg text-sm font-semibold hover:bg-[#163828] transition"
        >
          {t('finance.page.newJournal')}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <OmniStatCard label="عدد القيود" value={stats.journalCount.toLocaleString('ar-SA')} icon="📝" iconBg="bg-blue-50" />
        <OmniStatCard label="عدد السندات" value={stats.voucherCount.toLocaleString('ar-SA')} icon="🧾" iconBg="bg-amber-50" />
        <OmniStatCard label="عدد الحسابات" value={stats.accountCount.toLocaleString('ar-SA')} icon="🏦" iconBg="bg-indigo-50" />
        <OmniStatCard label="عدد مراكز التكلفة" value={stats.costCenterCount.toLocaleString('ar-SA')} icon="🏢" iconBg="bg-rose-50" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <DonutChart title="القيود حسب مراكز التكلفة" items={stats.costCenterDistribution} />
        <BarChartPanel title="القيود حسب النوع" items={stats.entryTypeDistribution} colorClass="bg-[#1f4d3a]" />
        <IncomeBarChart revenue={stats.incomeSummary.revenue} expenses={stats.incomeSummary.expenses} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3">
          <ErpCard title="آخر القيود المحاسبية" padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs">
                  <tr>
                    <th className="p-3 font-semibold">رقم المستند</th>
                    <th className="p-3 font-semibold">نوع القيد</th>
                    <th className="p-3 font-semibold">رقم القيد</th>
                    <th className="p-3 font-semibold">عنوان القيد</th>
                    <th className="p-3 font-semibold">قيمة القيد</th>
                    <th className="p-3 font-semibold">تاريخ القيد</th>
                    <th className="p-3 font-semibold">حالة القيد</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-gray-400">
                        لا توجد قيود محاسبية بعد
                      </td>
                    </tr>
                  ) : (
                    stats.recentEntries.map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                        <td className="p-3 font-mono text-blue-600">{entry.documentNumber}</td>
                        <td className="p-3 text-gray-600">{entry.entryType}</td>
                        <td className="p-3 font-mono">{entry.entryNumber}</td>
                        <td className="p-3 max-w-[200px] truncate">{entry.entryTitle}</td>
                        <td className="p-3 font-mono font-semibold">{formatCurrency(entry.entryValue)}</td>
                        <td className="p-3 text-gray-600">{formatDate(entry.entryDate)}</td>
                        <td className="p-3">
                          <StatusBadge status={entry.entryStatus} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ErpCard>
        </div>

        <ErpCard title="ملخص الإقرار الضريبي">
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
              ضريبة القيمة المضافة {VAT_RATE * 100}% — تراخيص السلامة
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">الإيرادات الخاضعة</span>
              <span className="font-mono font-semibold">{formatCurrency(stats.vatSummary.taxableRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">ضريبة المخرجات</span>
              <span className="font-mono font-semibold text-[#1f4d3a]">{formatCurrency(stats.vatSummary.outputVat)}</span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-gray-500">عدد سندات القبض</span>
              <span className="font-semibold">{stats.vatSummary.voucherCount}</span>
            </div>
            <Link
              href="/finance/reports"
              className="block text-center text-xs text-[#1f4d3a] font-semibold hover:underline pt-2"
            >
              عرض التقرير الكامل ←
            </Link>
          </div>
        </ErpCard>
      </div>
    </div>
  );
}
