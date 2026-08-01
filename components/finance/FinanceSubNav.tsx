'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FINANCE_NAV } from '@/lib/constants/accounting';

/** تبويبات داخلية لنظام الحسابات — بدون شريط جانبي */
export function FinanceSubNav() {
  const pathname = usePathname();

  return (
    <div className="bg-white border border-[var(--erp-border)] rounded-xl p-1.5 mb-4 overflow-x-auto">
      <div className="flex gap-1 min-w-max" role="tablist" aria-label="تبويبات الحسابات المالية">
        {FINANCE_NAV.map((item) => {
          const isActive =
            item.href === '/finance'
              ? pathname === '/finance'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              role="tab"
              aria-selected={isActive}
              className={`
                touch-target !h-auto px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition
                ${
                  isActive
                    ? 'bg-[var(--erp-primary)] text-white shadow-sm'
                    : 'text-[var(--erp-muted)] hover:bg-[var(--erp-page)] hover:text-[var(--erp-text)]'
                }
              `}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** @deprecated استخدم FinanceSubNav */
export const FinanceMobileNav = FinanceSubNav;
