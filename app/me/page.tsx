'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getVisibleSidebarNav, SYSTEM_MODULES } from '@/lib/constants/navigation';
import { ALL_DEPARTMENTS, departmentsFromPermissions } from '@/lib/auth/permissions';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

type ModuleFilter = 'all' | 'operations' | 'management';

export default function MyPage() {
  const { session, profile, permissions, canManageStaff } = useAuth();
  const { t, tNav, tNavDesc, tProfile, tRole } = useLanguage();
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const [query, setQuery] = useState('');

  if (!session || !profile) return null;

  const allowedDepartments = permissions.includes('*')
    ? ALL_DEPARTMENTS
    : profile.page_modules?.length
      ? profile.page_modules
      : departmentsFromPermissions(permissions);

  const visibleNav = getVisibleSidebarNav();
  const modules = SYSTEM_MODULES.filter((module) => {
    if (module.status !== 'active') return false;
    const nav = visibleNav.find((item) => item.href === module.href);
    return nav ? allowedDepartments.includes(nav.department) : false;
  });

  const pageTitle = tProfile(profile.page_title, undefined) || t('me.welcome', { name: profile.full_name });
  const pageBio = tProfile(profile.page_bio) || t('me.defaultBio');
  const jobTitle = tProfile(profile.job_title) || tRole(profile.role_code);
  const profileFields = [profile.full_name, profile.email, profile.phone, profile.username, jobTitle].filter(Boolean);
  const profileCompletion = Math.round((profileFields.length / 5) * 100);
  const moduleCoverage = SYSTEM_MODULES.filter((module) => module.status === 'active').length
    ? Math.round((modules.length / SYSTEM_MODULES.filter((module) => module.status === 'active').length) * 100)
    : 0;

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredModules = modules.filter((module) => {
    const label = module.href === '/projects' ? t('nav.projects.manage') : tNav(module.href, module.title);
    const matchesQuery = !normalizedQuery || `${label} ${module.description}`.toLocaleLowerCase().includes(normalizedQuery);
    const isManagement = ['/settings', '/platform', '/finance', '/hr'].includes(module.href);
    const matchesFilter =
      moduleFilter === 'all' ||
      (moduleFilter === 'management' && isManagement) ||
      (moduleFilter === 'operations' && !isManagement);
    return matchesQuery && matchesFilter;
  });

  const initials = profile.full_name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('');

  return (
    <div className="dashboard-page space-y-6 pb-8">
      <section className="dashboard-hero relative overflow-hidden rounded-[1.75rem] bg-[#101b18] text-white">
        <div className="dashboard-hero-glow" />
        <div className="relative z-10 grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end lg:p-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.12em] text-[#d9b878]">
              <span className="h-2 w-2 rounded-full bg-[#d9b878]" />
              {t('me.myPage')}
              <span className="text-white/35">/</span>
              <span className="text-white/60">EXECUTIVE OVERVIEW</span>
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-[-0.04em] sm:text-4xl lg:text-5xl">
              {pageTitle}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">{pageBio}</p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs sm:text-sm">
              <span className="dashboard-hero-chip isolate-ltr">@{profile.username}</span>
              <span className="dashboard-hero-chip">{jobTitle}</span>
              <span className="dashboard-hero-chip isolate-ltr">{profile.email}</span>
            </div>
          </div>
          <div className="dashboard-profile-mark" aria-label={profile.full_name}>
            <span>{initials || 'م'}</span>
            <small>{tRole(profile.role_code)}</small>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="مؤشرات الأداء">
        <KpiCard label="الوحدات المتاحة" value={modules.length} suffix="وحدة" tone="green" detail="بحسب الصلاحيات الحالية" />
        <KpiCard
          label="تغطية النظام"
          value={moduleCoverage}
          suffix="%"
          tone="gold"
          detail="من الوحدات النشطة"
          progress={moduleCoverage}
        />
        <KpiCard
          label="اكتمال الملف"
          value={profileCompletion}
          suffix="%"
          tone="dark"
          detail="بيانات الهوية الوظيفية"
          progress={profileCompletion}
        />
        <KpiCard
          label="الصلاحيات"
          value={permissions.includes('*') ? '∞' : permissions.length}
          suffix={permissions.includes('*') ? 'كامل' : 'صلاحية'}
          tone="light"
          detail={permissions.includes('*') ? 'وصول إداري شامل' : 'نطاق وصول مخصص'}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="dashboard-surface min-w-0 rounded-[1.35rem] border p-5 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-[var(--erp-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="dashboard-eyebrow">WORKSPACE DIRECTORY</p>
              <h2 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-[var(--erp-text)]">{t('me.mySections')}</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">الوصول السريع إلى مساحات العمل المفعّلة لك.</p>
            </div>
            {canManageStaff ? (
              <Link href="/settings/users" className="dashboard-text-link">{t('me.manageStaff')} <span>←</span></Link>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="dashboard-filter-group" role="tablist" aria-label="تصفية الوحدات">
              {(['all', 'operations', 'management'] as ModuleFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setModuleFilter(filter)}
                  className={moduleFilter === filter ? 'dashboard-filter is-active' : 'dashboard-filter'}
                  role="tab"
                  aria-selected={moduleFilter === filter}
                >
                  {filter === 'all' ? 'الكل' : filter === 'operations' ? 'التشغيل' : 'الإدارة'}
                </button>
              ))}
            </div>
            <label className="dashboard-search">
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في الوحدات" aria-label="ابحث في الوحدات" />
            </label>
          </div>

          {filteredModules.length === 0 ? (
            <p className="mt-6 rounded-xl bg-[var(--erp-page)] p-6 text-sm text-[var(--erp-muted)]">لا توجد وحدات مطابقة للبحث الحالي.</p>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {filteredModules.map((module, index) => (
                <Link key={module.href} href={module.href} className="dashboard-module group" style={{ animationDelay: `${index * 35}ms` }}>
                  <span className="dashboard-module-icon">{module.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <strong className="truncate text-[var(--erp-text)]">{module.href === '/projects' ? t('nav.projects.manage') : tNav(module.href, module.title)}</strong>
                      <span className="dashboard-module-arrow">←</span>
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-[var(--erp-muted)]">{tNavDesc(module.href, module.description)}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="dashboard-surface dashboard-progress rounded-[1.35rem] border p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="dashboard-eyebrow">PROFILE HEALTH</p>
                <h2 className="mt-1 text-xl font-bold text-[var(--erp-text)]">جاهزية الملف</h2>
              </div>
              <div className="dashboard-progress-ring" style={{ '--progress': `${profileCompletion}%` } as React.CSSProperties}><span>{profileCompletion}%</span></div>
            </div>
            <p className="mt-5 text-sm leading-6 text-[var(--erp-muted)]">كلما اكتملت بيانات الملف، أصبحت الهوية الوظيفية والتواصل الداخلي أكثر وضوحًا.</p>
            <Link href="/me" className="dashboard-outline-button mt-5">عرض الملف الشخصي <span>←</span></Link>
          </div>

          <div className="dashboard-surface rounded-[1.35rem] border p-6">
            <p className="dashboard-eyebrow">QUICK ACTIONS</p>
            <h2 className="mt-1 text-xl font-bold text-[var(--erp-text)]">اختصارات العمل</h2>
            <div className="mt-4 grid gap-2">
              <QuickAction href="/projects" label="فتح المشاريع" />
              <QuickAction href="/clients" label="استعراض العملاء" />
              <QuickAction href="/settings/company" label="إعدادات الشركة" />
            </div>
          </div>
        </aside>
      </section>

      <section className="dashboard-surface rounded-[1.35rem] border p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="dashboard-eyebrow">ACCOUNT SNAPSHOT</p>
            <h2 className="mt-1 text-xl font-bold text-[var(--erp-text)]">ملخص الحساب</h2>
          </div>
          <span className="dashboard-last-login">آخر دخول: <b className="isolate-ltr">{session.loggedInAt.slice(0, 16).replace('T', ' ')}</b></span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard title={t('me.role')} value={tRole(profile.role_code)} />
          <InfoCard title={t('me.permissionsCount')} value={String(permissions.includes('*') ? t('common.fullAccess') : permissions.length)} />
          <InfoCard title="البريد الإلكتروني" value={profile.email} />
          <InfoCard title="الرابط العام" value={`/u/?username=${profile.username}`} />
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value, suffix, detail, tone, progress }: { label: string; value: string | number; suffix: string; detail: string; tone: 'green' | 'gold' | 'dark' | 'light'; progress?: number }) {
  return (
    <article className={`dashboard-kpi dashboard-kpi-${tone}`}>
      <div className="flex items-start justify-between gap-3"><p>{label}</p><span className="dashboard-kpi-dot" /></div>
      <div className="mt-4 flex items-end gap-2"><strong>{value}</strong><span>{suffix}</span></div>
      <p className="mt-2 text-xs opacity-70">{detail}</p>
      {typeof progress === 'number' ? <div className="dashboard-kpi-progress"><span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div> : null}
    </article>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="dashboard-quick-action"><span>{label}</span><span>←</span></Link>;
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return <div className="dashboard-info-card"><p>{title}</p><strong className="bidi-plaintext">{value}</strong></div>;
}
