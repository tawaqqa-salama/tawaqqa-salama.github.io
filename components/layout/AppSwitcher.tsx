'use client';

import { useEffect, useId } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getVisibleSidebarNav, SYSTEM_MODULES } from '@/lib/constants/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';

type AppSwitcherProps = {
  open: boolean;
  onClose: () => void;
};

export default function AppSwitcher({ open, onClose }: AppSwitcherProps) {
  const pathname = usePathname();
  const { canAccess, canManageStaff } = useAuth();
  const titleId = useId();
  const visibleNav = getVisibleSidebarNav();

  const modules = SYSTEM_MODULES.filter((module) => {
    if (module.status !== 'active') return false;
    const nav = visibleNav.find((item) => item.href === module.href);
    if (!nav) return false;
    if (nav.department === 'settings') return canAccess('settings') || canManageStaff;
    return canAccess(nav.department);
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[4.5rem] sm:pt-20 sm:px-4">
      <button
        type="button"
        aria-label="إغلاق قائمة الأقسام"
        className="absolute inset-0 bg-[#1a2420]/45 backdrop-blur-[2px] animate-[fadeIn_160ms_ease-out]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-2xl max-h-[min(78vh,36rem)] overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-white shadow-[0_24px_64px_rgba(31,77,58,0.18)] animate-[switcherIn_200ms_cubic-bezier(0.22,1,0.36,1)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--erp-border)] px-4 py-3 sm:px-5">
          <div>
            <p id={titleId} className="text-base font-bold text-[var(--erp-text)]">
              أقسام المنصة
            </p>
            <p className="text-xs text-[var(--erp-muted)] mt-0.5">اختر قسماً للانتقال إليه مباشرة</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target rounded-xl border border-[var(--erp-border)] text-[var(--erp-muted)] hover:bg-[var(--erp-page)]"
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto p-3 sm:p-4">
          {modules.length === 0 ? (
            <p className="text-sm text-[var(--erp-muted)] p-4 text-center">لا توجد أقسام متاحة لحسابك.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {modules.map((module, index) => {
                const href =
                  module.href === '/settings' && !canAccess('settings') && canManageStaff
                    ? '/settings/users'
                    : module.href;
                const active =
                  pathname === module.href ||
                  pathname.startsWith(`${module.href}/`) ||
                  (module.href === '/finance' && pathname.startsWith('/finance'));

                return (
                  <Link
                    key={module.href}
                    href={href}
                    onClick={onClose}
                    style={{ animationDelay: `${index * 35}ms` }}
                    className={`
                      group rounded-xl border p-3.5 sm:p-4 transition
                      animate-[cardPop_280ms_cubic-bezier(0.22,1,0.36,1)_both]
                      ${
                        active
                          ? 'border-[var(--erp-primary)] bg-[#eef6f1] shadow-sm'
                          : 'border-[var(--erp-border)] bg-white hover:border-[var(--erp-primary)]/35 hover:bg-[#f7faf8]'
                      }
                    `}
                  >
                    <span
                      className={`
                        inline-flex h-11 w-11 items-center justify-center rounded-xl text-xl
                        transition-transform duration-200 group-hover:scale-105
                        ${active ? 'bg-[var(--erp-primary)] text-white' : 'bg-[var(--erp-page)] text-[var(--erp-text)]'}
                      `}
                    >
                      {module.icon}
                    </span>
                    <p className="mt-3 text-sm font-bold text-[var(--erp-text)] leading-snug">
                      {module.title}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--erp-muted)] leading-relaxed line-clamp-2">
                      {module.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
