'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useDateFilter } from '@/components/layout/DateFilterContext';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { DateRangePreset } from '@/lib/date/date-range';

const DEPARTMENT_PREFIXES = [
  '/marketing',
  '/sales',
  '/procurement',
  '/finance',
  '/hr',
  '/projects',
  '/design',
  '/settings',
];

const PRESETS: DateRangePreset[] = ['today', 'yesterday', 'week', 'month', 'year'];

function isDepartmentRoute(pathname: string): boolean {
  return DEPARTMENT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function formatClock(now: Date, locale: string): string {
  return now.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDayDate(now: Date, locale: string): string {
  return now.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function GlobalDateFilterBar() {
  const pathname = usePathname();
  const { lang, t, dir } = useLanguage();
  const { dateFrom, dateTo, setDateFrom, setDateTo, applyPreset, clearRange } = useDateFilter();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!isDepartmentRoute(pathname)) return null;

  const locale = lang === 'ar' ? 'ar-SA' : 'en-US';

  return (
    <div
      className="shrink-0 border-b border-[var(--erp-border)] bg-[#f7faf8] px-3 sm:px-5 py-2.5"
      dir={dir}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-mono font-semibold text-[var(--erp-primary)] tabular-nums">
            {formatClock(now, locale)}
          </span>
          <span className="text-[var(--erp-text)] font-medium">{formatDayDate(now, locale)}</span>
        </div>

        <div className="date-range-bar lg:flex-nowrap lg:justify-end">
          <label className="date-field">
            <span>{t('dateFilter.from')}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="date-field">
            <span>{t('dateFilter.to')}</span>
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1.5 items-end">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-lg border border-[var(--erp-border)] bg-white px-2.5 py-2 text-xs font-semibold text-[var(--erp-text)] hover:border-[var(--erp-primary)]/40 hover:text-[var(--erp-primary)] min-h-[42px]"
              >
                {t(`dateFilter.preset.${preset}`)}
              </button>
            ))}
            {(dateFrom || dateTo) && (
              <button type="button" onClick={clearRange} className="date-clear">
                {t('dateFilter.clear')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
