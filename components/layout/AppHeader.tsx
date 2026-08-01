'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { FINANCE_NAV } from '@/lib/constants/accounting';
import { SIDEBAR_NAV } from '@/lib/constants/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import AppSwitcher from '@/components/layout/AppSwitcher';
import { useModuleSubNav } from '@/components/layout/ModuleSubNavContext';

const LAUNCHER_HREF = '/me';

function resolveSection(
  pathname: string,
  searchTab?: string | null
): { title: string; subtitle?: string } {
  if (pathname === '/' || pathname === '/me' || pathname.startsWith('/me/')) {
    return { title: 'الأنظمة', subtitle: 'الصفحة الرئيسية' };
  }
  if (pathname.startsWith('/u')) {
    return { title: 'صفحة موظف' };
  }
  if (pathname.startsWith('/login')) {
    return { title: 'تسجيل الدخول' };
  }

  const main = SIDEBAR_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  if (!main) {
    return { title: 'الأنظمة' };
  }

  if (pathname.startsWith('/finance')) {
    if (pathname.startsWith('/finance/vouchers') && searchTab === 'approvals') {
      return { title: main.label, subtitle: 'الاعتماد المالي' };
    }
    const sub = FINANCE_NAV.find((item) => {
      const path = item.href.split('?')[0];
      if (item.href.includes('tab=approvals')) return false;
      return pathname === path || pathname.startsWith(`${path}/`);
    });
    if (sub && sub.href !== '/finance') {
      return { title: main.label, subtitle: sub.label };
    }
  }

  if (pathname.startsWith('/settings/') && pathname !== '/settings') {
    const settingsSubs: Record<string, string> = {
      '/settings/users': 'المستخدمون والصلاحيات',
      '/settings/company': 'بيانات الشركة',
      '/settings/activity': 'سجل النشاطات',
      '/settings/zatca': 'الفوترة الإلكترونية',
    };
    const sub = settingsSubs[pathname];
    if (sub) return { title: main.label, subtitle: sub };
  }

  return { title: main.label };
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 10.75 12 4.5l7.5 6.25V20a1 1 0 0 1-1 1h-4.25v-5.25h-4.5V21H5.5a1 1 0 0 1-1-1v-9.25Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AppsGridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function AppHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = resolveSection(pathname, searchParams.get('tab'));
  const { session, logout } = useAuth();
  const { hasSubNav, open: subNavOpen, toggleSubNav, isMobile } = useModuleSubNav();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const closeSwitcher = useCallback(() => setSwitcherOpen(false), []);
  const initial = (session?.fullName || 'م').trim().charAt(0);
  const isLauncher = pathname === '/me' || pathname === '/' || pathname.startsWith('/me/');

  const navBtnBase =
    'touch-target h-11 w-11 shrink-0 rounded-xl border transition inline-flex items-center justify-center';
  const navBtnIdle =
    'border-[var(--erp-border)] bg-white text-[var(--erp-text)] hover:border-[var(--erp-primary)]/40 hover:text-[var(--erp-primary)]';
  const navBtnActive =
    'border-[var(--erp-primary)] bg-[#eef6f1] text-[var(--erp-primary)]';

  return (
    <>
      <header className="bg-white border-b border-[var(--erp-border)] px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2 shrink-0 z-[55] relative">
        <div className="flex flex-row items-center justify-start gap-2 min-w-0">
          {/*
            ترتيب بصري من اليمين لليسار (RTL):
            1) ☰  2) الشبكة  3) البيت
          */}
          <nav
            aria-label="أزرار التنقل"
            className="header-nav-controls shrink-0"
            dir="rtl"
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {hasSubNav ? (
              <button
                type="button"
                onClick={toggleSubNav}
                className={`${navBtnBase} ${subNavOpen ? navBtnActive : navBtnIdle}`}
                style={{ order: 1 }}
                title={subNavOpen ? 'إخفاء قائمة القسم' : 'إظهار قائمة القسم'}
                aria-label={subNavOpen ? 'إخفاء القائمة الفرعية' : 'إظهار القائمة الفرعية'}
                aria-expanded={subNavOpen}
                aria-controls="module-subnav"
              >
                <HamburgerIcon />
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              className={`${navBtnBase} ${switcherOpen ? navBtnActive : navBtnIdle}`}
              style={{ order: 2 }}
              title="قائمة الأقسام"
              aria-label="فتح قائمة الأقسام"
              aria-haspopup="dialog"
              aria-expanded={switcherOpen}
            >
              <AppsGridIcon />
            </button>

            <Link
              href={LAUNCHER_HREF}
              className={`${navBtnBase} ${isLauncher ? navBtnActive : navBtnIdle}`}
              style={{ order: 3 }}
              title="الصفحة الرئيسية للأنظمة"
              aria-label="الصفحة الرئيسية للأنظمة"
            >
              <HomeIcon />
            </Link>
          </nav>

          <div className="min-w-0 ms-1 sm:ms-2">
            <p className="text-sm sm:text-base font-bold text-[var(--erp-text)] truncate leading-tight">
              {section.title}
            </p>
            {section.subtitle ? (
              <p className="text-[11px] sm:text-xs text-[var(--erp-muted)] truncate mt-0.5">
                {section.subtitle}
              </p>
            ) : hasSubNav ? (
              <p className="text-[11px] sm:text-xs text-[var(--erp-muted)] truncate mt-0.5 hidden sm:block">
                {subNavOpen
                  ? isMobile
                    ? 'القائمة الفرعية مفتوحة'
                    : 'التبويبات ظاهرة — اضغط القائمة لإخفائها'
                  : 'التبويبات مخفية — اضغط القائمة لإظهارها'}
              </p>
            ) : (
              <p className="text-[11px] sm:text-xs text-[var(--erp-muted)] truncate mt-0.5 hidden sm:block">
                نظام مستقل · اختر قسماً من الشبكة
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-sm text-gray-600 shrink-0">
          <span className="flex items-center gap-2 bg-[var(--erp-page)] border border-[var(--erp-border)] rounded-full px-2 sm:px-3 py-1.5 min-h-[44px]">
            <span className="h-7 w-7 rounded-full bg-[var(--erp-primary)] text-white flex items-center justify-center text-xs">
              {initial}
            </span>
            <span className="hidden sm:inline max-w-[9rem] truncate">{session?.fullName || 'موظف'}</span>
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="touch-target text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 hover:bg-rose-100"
          >
            خروج
          </button>
        </div>
      </header>

      <AppSwitcher open={switcherOpen} onClose={closeSwitcher} />
    </>
  );
}
