'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { getVisibleSidebarNav, SYSTEM_MODULES } from '@/lib/constants/navigation';
import { PLATFORM_NAME, PLATFORM_SHORT_NAME } from '@/lib/constants/branding';
import { useAuth } from '@/lib/auth/AuthProvider';

export default function HomePage() {
  const { session, canAccess, canManageStaff } = useAuth();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'all' | 'priority'>('all');
  const visibleNav = getVisibleSidebarNav();
  const modules = SYSTEM_MODULES.filter((module) => {
    if (module.status !== 'active') return false;
    const nav = visibleNav.find((item) => item.href === module.href);
    if (!nav) return false;
    if (nav.department === 'settings') return canAccess('settings') || canManageStaff;
    return canAccess(nav.department);
  });

  const filteredModules = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return modules.filter((module) => {
      const matchesQuery = !normalized || `${module.title} ${module.description}`.toLocaleLowerCase().includes(normalized);
      const priority = ['/projects', '/clients', '/design', '/finance'].includes(module.href);
      return matchesQuery && (view === 'all' || priority);
    });
  }, [modules, query, view]);

  const firstName = session?.fullName?.split(/\s+/)[0] || 'بك';
  const initials = session?.fullName?.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('') || 'ت';

  return (
    <div className="main-dashboard space-y-6 pb-8">
      <section className="main-dashboard-hero relative overflow-hidden rounded-[1.75rem]">
        <div className="main-dashboard-orbit main-dashboard-orbit-one" />
        <div className="main-dashboard-orbit main-dashboard-orbit-two" />
        <div className="relative z-10 grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end lg:p-10">
          <div>
            <p className="main-dashboard-kicker">{PLATFORM_SHORT_NAME} <span>/</span> CONTROL CENTER</p>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-[-0.045em] text-white sm:text-4xl lg:text-5xl">أهلًا {firstName}، هذه مساحة عملك اليوم.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">{PLATFORM_NAME} — ابدأ من الوحدات المتاحة لك وأدر أعمالك من مركز واحد واضح.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/projects" className="main-dashboard-primary-action">فتح المشاريع <span>←</span></Link>
              <Link href="/me" className="main-dashboard-ghost-action">صفحة الحساب <span>↗</span></Link>
            </div>
          </div>
          <div className="main-dashboard-avatar" aria-label={session?.fullName || 'المستخدم'}><span>{initials}</span><small>مساحة آمنة</small></div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="ملخص لوحة التحكم">
        <DashboardStat label="الوحدات المتاحة" value={modules.length} suffix="وحدة" detail="حسب صلاحيات حسابك" tone="primary" />
        <DashboardStat label="حالة الحساب" value="نشط" suffix="" detail="الجلسة الحالية تعمل" tone="success" />
        <DashboardStat label="نوع الوصول" value={canManageStaff ? 'إداري' : 'مخصص'} suffix="" detail="نطاق وصول آمن" tone="dark" />
        <DashboardStat label="الهوية" value={session?.username ? `@${session.username}` : '—'} suffix="" detail={session?.roleCode || 'حساب موظف'} tone="light" compact />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="main-dashboard-surface min-w-0 rounded-[1.35rem] border p-5 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-[var(--erp-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="main-dashboard-eyebrow">YOUR WORKSPACE</p><h2 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-[var(--erp-text)]">أنظمة {PLATFORM_SHORT_NAME}</h2><p className="mt-1 text-sm text-[var(--erp-muted)]">كل ما تحتاجه لإدارة عمليات السلامة والاستشارات.</p></div>
            <div className="main-dashboard-view-switch" role="tablist" aria-label="عرض الوحدات"><button type="button" className={view === 'all' ? 'is-active' : ''} onClick={() => setView('all')} role="tab" aria-selected={view === 'all'}>الكل</button><button type="button" className={view === 'priority' ? 'is-active' : ''} onClick={() => setView('priority')} role="tab" aria-selected={view === 'priority'}>الأولوية</button></div>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="main-dashboard-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن نظام أو وحدة" aria-label="ابحث عن نظام أو وحدة" /></label><span className="text-xs font-semibold text-[var(--erp-muted)]">{filteredModules.length} من {modules.length} وحدة</span></div>
          {filteredModules.length === 0 ? <p className="mt-6 rounded-xl bg-[var(--erp-page)] p-6 text-sm text-[var(--erp-muted)]">لا توجد وحدات مطابقة للبحث الحالي.</p> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{filteredModules.map((module, index) => <Link key={module.href} href={module.href} className="main-dashboard-module group" style={{ animationDelay: `${index * 45}ms` }}><span className="main-dashboard-module-icon">{module.icon}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3"><strong className="truncate text-[var(--erp-text)]">{module.title}</strong><span className="main-dashboard-arrow">←</span></span><span className="mt-1 block text-sm leading-6 text-[var(--erp-muted)]">{module.description}</span></span></Link>)}</div>}
        </div>
        <aside className="space-y-6">
          <div className="main-dashboard-surface rounded-[1.35rem] border p-6"><p className="main-dashboard-eyebrow">QUICK ACCESS</p><h2 className="mt-1 text-xl font-bold text-[var(--erp-text)]">اختصارات العمل</h2><div className="mt-4 grid gap-2"><QuickLink href="/projects" label="المشاريع والاستشارات" /><QuickLink href="/clients" label="العملاء" /><QuickLink href="/design" label="مركز التصميم" /><QuickLink href="/me" label="ملفي وصلاحياتي" /><QuickLink href="/performance" label="مراقبة الأداء" /></div></div>
          <div className="main-dashboard-status rounded-[1.35rem] p-6"><div className="flex items-center gap-3"><span className="main-dashboard-status-dot" /><strong>النظام يعمل بشكل طبيعي</strong></div><p className="mt-3 text-sm leading-6 text-white/65">حسابك متصل ويمكنك الوصول إلى الوحدات المفعّلة بحسب صلاحياتك.</p><Link href="/settings" className="mt-5 inline-flex text-sm font-bold text-[#a78bfa] hover:text-white">إدارة الإعدادات <span className="mr-2">←</span></Link></div>
        </aside>
      </section>
    </div>
  );
}

function DashboardStat({ label, value, suffix, detail, tone, compact }: { label: string; value: string | number; suffix: string; detail: string; tone: 'primary' | 'success' | 'dark' | 'light'; compact?: boolean }) { return <article className={`main-dashboard-stat main-dashboard-stat-${tone}`}><div className="flex items-start justify-between gap-3"><p>{label}</p><span className="main-dashboard-stat-dot" /></div><div className="mt-4 flex items-end gap-2"><strong className={compact ? 'text-xl' : ''}>{value}</strong>{suffix ? <span>{suffix}</span> : null}</div><p className="mt-2 text-xs opacity-70">{detail}</p></article>; }
function QuickLink({ href, label }: { href: string; label: string }) { return <Link href={href} className="main-dashboard-quick-link"><span>{label}</span><span>←</span></Link>; }
