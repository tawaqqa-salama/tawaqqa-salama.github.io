'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FINANCE_NAV } from '@/lib/constants/accounting';
import { SIDEBAR_NAV } from '@/lib/constants/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useMobileNav } from '@/components/layout/MobileNavContext';

const ROUTE_LABELS: Record<string, string> = {
  '/': 'الأنظمة',
  '/me': 'صفحتي',
  '/u': 'صفحة موظف',
  '/login': 'تسجيل الدخول',
  '/marketing': 'إدارة التسويق',
  '/sales': 'إدارة المبيعات',
  '/procurement': 'إدارة المشتريات',
  '/finance': 'الحسابات المالية',
  '/hr': 'الموارد البشرية',
  '/projects': 'المشاريع',
  '/settings': 'الإعدادات',
  '/settings/users': 'المستخدمون والصلاحيات',
};

function resolveBreadcrumbs(pathname: string): { label: string; href?: string }[] {
  if (pathname === '/') return [{ label: 'الأنظمة' }];
  if (pathname === '/me') return [{ label: 'صفحتي' }];
  if (pathname.startsWith('/u')) return [{ label: 'صفحة موظف' }];
  if (pathname.startsWith('/settings/users')) {
    return [
      { label: 'الإعدادات', href: '/settings' },
      { label: 'المستخدمون والصلاحيات' },
    ];
  }

  const main = SIDEBAR_NAV.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  if (!main) return [{ label: 'الأنظمة', href: '/' }];

  const crumbs: { label: string; href?: string }[] = [
    { label: ROUTE_LABELS[main.href] || main.label, href: main.href },
  ];

  if (pathname.startsWith('/finance/')) {
    const sub = FINANCE_NAV.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    );
    if (sub && sub.href !== '/finance') {
      crumbs.push({ label: sub.label });
    }
  }

  return crumbs;
}

export default function AppHeader() {
  const pathname = usePathname();
  const breadcrumbs = resolveBreadcrumbs(pathname);
  const { session, logout } = useAuth();
  const { toggleNav, open } = useMobileNav();
  const initial = (session?.fullName || 'م').trim().charAt(0);

  return (
    <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={toggleNav}
          className="touch-target md:hidden rounded-xl border bg-gray-50 text-gray-700"
          aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={open}
        >
          <span className="text-lg leading-none">{open ? '✕' : '☰'}</span>
        </button>

        <Link
          href="/me"
          className="touch-target hidden sm:inline-flex text-gray-400 hover:text-gray-600 text-lg"
          title="صفحتي"
        >
          ⌂
        </Link>
        <nav className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-2 min-w-0">
              {index > 0 && <span className="text-gray-300">/</span>}
              {crumb.href && index < breadcrumbs.length - 1 ? (
                <Link href={crumb.href} className="hover:text-gray-800 truncate">
                  {crumb.label}
                </Link>
              ) : (
                <span className={`truncate ${index === breadcrumbs.length - 1 ? 'text-gray-800 font-semibold' : ''}`}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 text-sm text-gray-600 shrink-0">
        <span className="flex items-center gap-2 bg-gray-50 border rounded-full px-2 sm:px-3 py-1.5 min-h-[44px]">
          <span className="h-7 w-7 rounded-full bg-[#1f4d3a] text-white flex items-center justify-center text-xs">
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
  );
}
