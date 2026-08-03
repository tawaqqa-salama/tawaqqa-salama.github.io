'use client';

import { formatCurrency } from '@/lib/format/currency';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

interface BarChartPanelProps {
  title: string;
  items: { label: string; value: number }[];
  colorClass?: string;
  valueFormatter?: (value: number) => string;
}

export default function BarChartPanel({
  title,
  items,
  colorClass = 'bg-[#1f4d3a]',
  valueFormatter = (v) => String(v),
}: BarChartPanelProps) {
  const { t } = useLanguage();
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 h-full">
      <h3 className="font-bold text-gray-800 text-sm mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">{t('finance.chart.noData')}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.label}>
              <div className="flex justify-between text-xs mb-1 gap-2">
                <span className="text-gray-600 truncate">{item.label}</span>
                <span className="font-semibold text-gray-800 shrink-0">{valueFormatter(item.value)}</span>
              </div>
              <div className="h-7 bg-gray-100 rounded-md overflow-hidden">
                <div
                  className={`h-full rounded-md ${colorClass}`}
                  style={{ width: `${Math.max((item.value / max) * 100, 6)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function IncomeBarChart({
  revenue,
  expenses,
}: {
  revenue: number;
  expenses: number;
}) {
  const { t } = useLanguage();
  const max = Math.max(revenue, expenses, 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 h-full">
      <h3 className="font-bold text-gray-800 text-sm mb-4">{t('finance.chart.incomeSummary')}</h3>
      <div className="space-y-4">
        <BarRow label={t('finance.chart.revenue')} value={revenue} max={max} color="bg-[#6366f1]" />
        <BarRow label={t('finance.chart.expenses')} value={expenses} max={max} color="bg-[#1f4d3a]" />
        <div className="pt-2 border-t flex justify-between text-xs">
          <span className="text-gray-500">{t('finance.chart.netIncome')}</span>
          <span
            className={`font-bold font-mono ${revenue - expenses >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
          >
            {formatCurrency(revenue - expenses)}
          </span>
        </div>
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-mono font-semibold">{formatCurrency(value)}</span>
      </div>
      <div className="h-8 bg-gray-100 rounded-md overflow-hidden">
        <div className={`h-full rounded-md ${color}`} style={{ width: `${Math.max((value / max) * 100, 6)}%` }} />
      </div>
    </div>
  );
}
