'use client';

import { formatCurrency } from '@/lib/format/currency';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

interface ChartItem {
  label: string;
  value: number;
}

interface SimpleBarChartProps {
  title: string;
  items: ChartItem[];
  valueFormatter?: (value: number) => string;
  colorClass?: string;
}

export default function SimpleBarChart({
  title,
  items,
  valueFormatter = (value) => String(value),
  colorClass = 'bg-emerald-500',
}: SimpleBarChartProps) {
  const { t } = useLanguage();
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="font-bold text-gray-800 mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">{t('finance.chart.noData')}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{item.label}</span>
                <span className="font-mono font-semibold text-gray-800">{valueFormatter(item.value)}</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${colorClass}`}
                  style={{ width: `${Math.max((item.value / max) * 100, 4)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function IncomeComparisonChart({
  revenue,
  expenses,
}: {
  revenue: number;
  expenses: number;
}) {
  const { t } = useLanguage();
  const max = Math.max(revenue, expenses, 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="font-bold text-gray-800 mb-4">{t('finance.chart.incomeSummary')}</h3>
      <div className="space-y-4">
        <BarRow label={t('finance.chart.revenue')} value={revenue} max={max} colorClass="bg-emerald-500" />
        <BarRow label={t('finance.chart.expenses')} value={expenses} max={max} colorClass="bg-rose-500" />
        <div className="pt-3 border-t flex justify-between text-sm">
          <span className="text-gray-600">{t('finance.chart.netIncome')}</span>
          <span className={`font-bold font-mono ${revenue - expenses >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
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
  colorClass,
}: {
  label: string;
  value: number;
  max: number;
  colorClass: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-mono font-semibold">{formatCurrency(value)}</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${Math.max((value / max) * 100, 4)}%` }}
        />
      </div>
    </div>
  );
}
