'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIDEBAR_NAV } from '@/lib/constants/navigation';
import { FINANCE_NAV } from '@/lib/constants/accounting';
import { PLATFORM_NAME, PLATFORM_SHORT_NAME } from '@/lib/constants/branding';
import { useAuth } from '@/lib/auth/AuthProvider';

export default function AppSidebar() {
  const pathname = usePathname();
  const { canAccess, canManageStaff, session } = useAuth();

  const items = SIDEBAR_NAV.filter((item) => {
    if (item.department === 'settings') return canAccess('settings') || canManageStaff;
    return canAccess(item.department);
  });

  return (
    <aside className="w-64 bg-[#2c3333] flex flex-col h-full shrink-0 text-white">
      <Link href="/me" className="p-5 border-b border-white/10 block hover:bg-white/5 transition">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#b8e986] flex items-center justify-center text-[#2c3333] font-bold text-lg shrink-0">
            ت
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-snug">{PLATFORM_SHORT_NAME}</p>
            <p className="text-[10px] text-white/60 mt-0.5 truncate">{PLATFORM_NAME}</p>
          </div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        <Link
          href="/me"
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
            pathname === '/me' || pathname.startsWith('/me/')
              ? 'bg-[#b8e986] text-[#2c3333] shadow-sm'
              : 'text-white/85 hover:bg-white/10'
          }`}
        >
          <span className="text-base leading-none w-5 text-center">👤</span>
          <span>صفحتي</span>
        </Link>

        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.href === '/finance' && pathname.startsWith('/finance'));

          return (
            <Link
              key={item.href}
              href={item.href === '/settings' && !canAccess('settings') && canManageStaff ? '/settings/users' : item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-[#b8e986] text-[#2c3333] shadow-sm'
                  : 'text-white/85 hover:bg-white/10'
              }`}
            >
              <span className="text-base leading-none w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="rounded-lg bg-white/5 p-3 text-[11px] text-white/70 leading-relaxed">
          <p className="font-semibold text-[#b8e986] mb-1">{session?.fullName || 'موظف'}</p>
          @{session?.username || '—'} · {session?.roleCode || '—'}
        </div>
      </div>
    </aside>
  );
}

export function FinanceSidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 bg-[#243030] rounded-xl overflow-hidden hidden lg:block">
      <div className="p-4 border-b border-white/10">
        <p className="text-xs text-white/50">الحسابات المالية</p>
        <p className="text-sm font-semibold text-white mt-0.5">القائمة الفرعية</p>
      </div>
      <nav className="p-2 space-y-0.5">
        {FINANCE_NAV.map((item) => {
          const isActive =
            item.href === '/finance'
              ? pathname === '/finance'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition ${
                isActive ? 'bg-[#b8e986] text-[#2c3333]' : 'text-white/80 hover:bg-white/10'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
