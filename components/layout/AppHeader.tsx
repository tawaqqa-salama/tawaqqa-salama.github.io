'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { FINANCE_NAV } from '@/lib/constants/accounting';
import { getVisibleSidebarNav } from '@/lib/constants/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import AppSwitcher from '@/components/layout/AppSwitcher';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { useModuleSubNav } from '@/components/layout/ModuleSubNavContext';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

const LAUNCHER_HREF = '/me';

function resolveSection(
  pathname: string,
  searchTab: string | null | undefined,
  t: (key: string) => string,
  tNav: (href: string, fallback?: string) => string,
  tFinance: (href: string, fallback: string) => string,
  tSettingsSub: (pathname: string) => string | null
): { title: string; subtitle?: string } {
  if (pathname === '/' || pathname === '/me' || pathname.startsWith('/me/')) {
    return { title: t('shell.systems'), subtitle: t('shell.homeSubtitle') };
  }
  if (pathname.startsWith('/u')) {
    return { title: t('shell.employeePage') };
  }
  if (pathname.startsWith('/login')) {
    return { title: t('shell.login') };
  }

  const main = getVisibleSidebarNav().find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  if (!main) {
    return { title: t('shell.systems') };
  }

  const mainLabel = tNav(main.href, main.label);

  if (pathname.startsWith('/finance')) {
    if (pathname.startsWith('/finance/vouchers') && searchTab === 'approvals') {
      return { title: mainLabel, subtitle: t('finance.approvals') };
    }
    const sub = FINANCE_NAV.find((item) => {
      const path = item.href.split('?')[0];
      if (item.href.includes('tab=approvals')) return false;
      return pathname === path || pathname.startsWith(`${path}/`);
    });
    if (sub && sub.href !== '/finance') {
      return { title: mainLabel, subtitle: tFinance(sub.href, sub.label) };
    }
  }

  if (pathname.startsWith('/settings/') && pathname !== '/settings') {
    const sub = tSettingsSub(pathname);
    if (sub) return { title: mainLabel, subtitle: sub };
  }

  return { title: mainLabel };
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
  const { lang, t, tNav, tFinance, tSettingsSub, dir } = useLanguage();
  const section = resolveSection(
    pathname,
    searchParams.get('tab'),
    t,
    tNav,
    tFinance,
    tSettingsSub
  );
  const { session, logout } = useAuth();
  const { hasSubNav, open: subNavOpen, toggleSubNav, isMobile } = useModuleSubNav();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const closeSwitcher = useCallback(() => setSwitcherOpen(false), []);
  const closeLogoutConfirm = useCallback(() => {
    if (loggingOut) return;
    setLogoutConfirmOpen(false);
  }, [loggingOut]);
  const confirmLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  }, [logout]);

  useEffect(() => {
    if (!logoutConfirmOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLogoutConfirm();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [logoutConfirmOpen, closeLogoutConfirm]);

  const initial = (session?.fullName || (lang === 'ar' ? 'م' : 'S')).trim().charAt(0);
  const isLauncher = pathname === '/me' || pathname === '/' || pathname.startsWith('/me/');

  const navBtnBase =
    'touch-target h-11 w-11 shrink-0 rounded-xl border transition inline-flex items-center justify-center';
  const navBtnIdle =
    'border-[var(--erp-border)] bg-white text-[var(--erp-text)] hover:border-[var(--erp-primary)]/40 hover:text-[var(--erp-primary)]';
  const navBtnActive =
    'border-[var(--erp-primary)] bg-[#eef6f1] text-[var(--erp-primary)]';

  return (
    <>
      <header className="bg-white border-b border-[var(--erp-border)] px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2 sm:gap-3 shrink-0 z-[55] relative">
        <div className="flex flex-row items-center justify-start gap-2 min-w-0 flex-1">
          <nav
            aria-label={t('shell.navAria')}
            className="header-nav-controls shrink-0"
            dir={dir}
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
                title={subNavOpen ? t('shell.toggleSubnavHide') : t('shell.toggleSubnavShow')}
                aria-label={
                  subNavOpen ? t('shell.toggleSubnavHideAria') : t('shell.toggleSubnavShowAria')
                }
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
              title={t('shell.appsTitle')}
              aria-label={t('shell.openApps')}
              aria-haspopup="dialog"
              aria-expanded={switcherOpen}
            >
              <AppsGridIcon />
            </button>

            <Link
              href={LAUNCHER_HREF}
              className={`${navBtnBase} ${isLauncher ? navBtnActive : navBtnIdle}`}
              style={{ order: 3 }}
              title={t('shell.homeTitle')}
              aria-label={t('shell.homeAria')}
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
                    ? t('shell.subnavOpenMobile')
                    : t('shell.subnavVisible')
                  : t('shell.subnavHidden')}
              </p>
            ) : (
              <p className="text-[11px] sm:text-xs text-[var(--erp-muted)] truncate mt-0.5 hidden sm:block">
                {t('shell.standaloneHint')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-sm text-gray-600 shrink-0">
          <LanguageSwitcher />
          <span className="flex items-center gap-2 bg-[var(--erp-page)] border border-[var(--erp-border)] rounded-full px-2 sm:px-3 py-1.5 min-h-[44px]">
            <span className="h-7 w-7 rounded-full bg-[var(--erp-primary)] text-white flex items-center justify-center text-xs">
              {initial}
            </span>
            <span className="hidden sm:inline max-w-[9rem] truncate">
              {session?.fullName || t('common.employee')}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setLogoutConfirmOpen(true)}
            className="touch-target text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 hover:bg-rose-100"
          >
            {t('common.logout')}
          </button>
        </div>
      </header>

      <AppSwitcher open={switcherOpen} onClose={closeSwitcher} />

      {logoutConfirmOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label={t('common.cancel')}
            className="absolute inset-0 bg-[#1a2420]/45 backdrop-blur-[2px]"
            onClick={closeLogoutConfirm}
            disabled={loggingOut}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
            className="relative w-full max-w-sm rounded-2xl border border-[var(--erp-border)] bg-white p-5 shadow-[0_24px_64px_rgba(31,77,58,0.18)]"
          >
            <h2 id="logout-confirm-title" className="text-base font-bold text-[var(--erp-text)]">
              {t('common.logoutConfirmTitle')}
            </h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">{t('common.logoutConfirmBody')}</p>
            <div className="mt-5 flex flex-row-reverse gap-2">
              <button
                type="button"
                onClick={() => void confirmLogout()}
                disabled={loggingOut}
                className="touch-target flex-1 rounded-xl bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {loggingOut ? t('common.loading') : t('common.logoutConfirm')}
              </button>
              <button
                type="button"
                onClick={closeLogoutConfirm}
                disabled={loggingOut}
                className="touch-target flex-1 rounded-xl border border-[var(--erp-border)] bg-white px-3 text-sm font-semibold text-[var(--erp-text)] hover:bg-[var(--erp-page)] disabled:opacity-60"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
