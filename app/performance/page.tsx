'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  getRecentPerformanceMetrics,
  subscribePerformanceMetrics,
  type PerformanceMetric,
} from '@/lib/performance/measure-request';

function formatDuration(value: number): string {
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

export default function PerformancePage() {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>(() => getRecentPerformanceMetrics());
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  useEffect(() => {
    const sync = () => {
      setMetrics(getRecentPerformanceMetrics());
      setLastUpdated(new Date());
    };
    const unsubscribe = subscribePerformanceMetrics(sync);
    window.addEventListener('tawaqqa:performance-metric', sync);
    return () => {
      unsubscribe();
      window.removeEventListener('tawaqqa:performance-metric', sync);
    };
  }, []);

  const summary = useMemo(() => {
    const total = metrics.length;
    const successful = metrics.filter((metric) => metric.success).length;
    const durations = metrics.map((metric) => metric.durationMs);
    const cacheHits = metrics.filter((metric) => metric.cacheStatus === 'hit').length;
    return {
      total,
      avgDuration: total ? Math.round(durations.reduce((sum, value) => sum + value, 0) / total) : 0,
      successRate: total ? Math.round((successful / total) * 100) : 0,
      cacheHitRate: total ? Math.round((cacheHits / total) * 100) : 0,
      slowest: durations.length ? Math.max(...durations) : 0,
    };
  }, [metrics]);

  const groupedRequests = useMemo(() => {
    const groups = new Map<string, { count: number; avg: number; failures: number }>();
    for (const metric of metrics) {
      const current = groups.get(metric.name) || { count: 0, avg: 0, failures: 0 };
      current.avg = Math.round((current.avg * current.count + metric.durationMs) / (current.count + 1));
      current.count += 1;
      if (!metric.success) current.failures += 1;
      groups.set(metric.name, current);
    }
    return [...groups.entries()].sort((a, b) => b[1].avg - a[1].avg).slice(0, 6);
  }, [metrics]);

  return (
    <div className="main-dashboard space-y-6 pb-8">
      <section className="main-dashboard-hero relative overflow-hidden rounded-[1.75rem]">
        <div className="main-dashboard-orbit main-dashboard-orbit-one" />
        <div className="main-dashboard-orbit main-dashboard-orbit-two" />
        <div className="relative z-10 flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:p-10">
          <div>
            <p className="main-dashboard-kicker">OBSERVABILITY / LIVE METRICS</p>
            <h1 className="mt-4 text-3xl font-bold tracking-[-0.045em] text-white sm:text-4xl">مراقبة أداء المنصة</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">
              مؤشرات مباشرة لزمن طلبات البيانات، نسبة النجاح، والاستفادة من التخزين المؤقت داخل الجلسة الحالية.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white/80">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#23c7b6]" />
              قياس مباشر
            </span>
            <Link href="/" className="main-dashboard-ghost-action">العودة للوحة الرئيسية <span>↗</span></Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="مؤشرات الأداء">
        <PerformanceStat label="متوسط زمن الطلب" value={formatDuration(summary.avgDuration)} detail="لآخر القياسات" tone="primary" />
        <PerformanceStat label="نجاح الطلبات" value={`${summary.successRate}%`} detail={`${summary.total} طلبًا مقاسًا`} tone="success" />
        <PerformanceStat label="نسبة Cache Hit" value={`${summary.cacheHitRate}%`} detail="من قراءات الكاش" tone="violet" />
        <PerformanceStat label="أبطأ طلب" value={formatDuration(summary.slowest)} detail="أعلى زمن مسجل" tone="coral" />
        <PerformanceStat label="عدد القياسات" value={summary.total} detail="آخر 100 قياس" tone="dark" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="main-dashboard-surface rounded-[1.35rem] border p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4 border-b border-[var(--erp-border)] pb-5">
            <div><p className="main-dashboard-eyebrow">REQUEST BREAKDOWN</p><h2 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">أداء الطلبات حسب الخدمة</h2></div>
            <span className="text-xs font-semibold text-[var(--erp-muted)]">تحديث تلقائي</span>
          </div>
          {groupedRequests.length === 0 ? (
            <div className="mt-6 rounded-2xl bg-[var(--erp-page)] p-8 text-center text-sm text-[var(--erp-muted)]">افتح المشاريع أو العملاء أو المبيعات لبدء تسجيل القياسات.</div>
          ) : (
            <div className="mt-5 space-y-3">
              {groupedRequests.map(([name, group]) => (
                <div key={name} className="performance-request-row">
                  <div className="min-w-0 flex-1"><strong className="block truncate text-sm text-[var(--erp-text)]">{name}</strong><span className="text-xs text-[var(--erp-muted)]">{group.count} قياس · {group.failures} فشل</span></div>
                  <span className="performance-duration">{formatDuration(group.avg)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="main-dashboard-surface rounded-[1.35rem] border p-6">
          <p className="main-dashboard-eyebrow">LIVE FEED</p>
          <h2 className="mt-1 text-xl font-bold text-[var(--erp-text)]">آخر الطلبات</h2>
          <p className="mt-2 text-xs text-[var(--erp-muted)]">آخر تحديث: {lastUpdated.toLocaleTimeString('ar-SA')}</p>
          <div className="mt-5 space-y-2">
            {metrics.slice(-8).reverse().map((metric, index) => (
              <div key={`${metric.timestamp}-${metric.name}-${index}`} className="performance-feed-row">
                <span className={`performance-status-dot ${metric.success ? 'is-success' : 'is-failed'}`} />
                <div className="min-w-0 flex-1"><strong className="block truncate text-xs text-[var(--erp-text)]">{metric.name}</strong><span className="text-[11px] text-[var(--erp-muted)]">{formatTime(metric.timestamp)} · {metric.cacheStatus || 'بدون كاش'}</span></div>
                <span className="text-xs font-bold text-[var(--erp-text)]">{formatDuration(metric.durationMs)}</span>
              </div>
            ))}
            {!metrics.length && <p className="rounded-xl bg-[var(--erp-page)] p-5 text-center text-xs text-[var(--erp-muted)]">لا توجد قياسات بعد.</p>}
          </div>
        </aside>
      </section>
    </div>
  );
}

function PerformanceStat({ label, value, detail, tone }: { label: string; value: string | number; detail: string; tone: 'primary' | 'success' | 'violet' | 'coral' | 'dark' }) {
  return <article className={`main-dashboard-stat main-dashboard-stat-${tone}`}><div className="flex items-start justify-between gap-3"><p>{label}</p><span className="main-dashboard-stat-dot" /></div><strong className="mt-4 block text-3xl font-bold tracking-[-0.04em]">{value}</strong><p className="mt-2 text-xs opacity-70">{detail}</p></article>;
}
