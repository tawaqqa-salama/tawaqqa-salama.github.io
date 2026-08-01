'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { FINANCE_NAV } from '@/lib/constants/accounting';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';

function hrefPath(href: string): string {
  return href.split('?')[0] || href;
}

function hrefTab(href: string): string | null {
  const q = href.split('?')[1];
  if (!q) return null;
  return new URLSearchParams(q).get('tab');
}

/** تبويبات داخلية لنظام الحسابات — تُخفى/تُظهر عبر زر ☰ */
export function FinanceSubNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');

  return (
    <ModuleSubNavSlot label="تبويبات الحسابات المالية">
      <div
        id="module-subnav"
        className="bg-white border border-[var(--erp-border)] rounded-xl p-1.5 overflow-x-auto"
      >
        <div className="flex gap-1 min-w-max" role="tablist" aria-label="تبويبات الحسابات المالية">
          {FINANCE_NAV.map((item) => {
            const path = hrefPath(item.href);
            const tab = hrefTab(item.href);
            const isApprovalsLink = tab === 'approvals';
            const isVouchersRoot = path === '/finance/vouchers' && !tab;

            let isActive = false;
            if (item.href === '/finance') {
              isActive = pathname === '/finance';
            } else if (isApprovalsLink) {
              isActive = pathname.startsWith('/finance/vouchers') && currentTab === 'approvals';
            } else if (isVouchersRoot) {
              isActive = pathname.startsWith('/finance/vouchers') && currentTab !== 'approvals';
            } else {
              isActive = pathname === path || pathname.startsWith(`${path}/`);
            }

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
    </ModuleSubNavSlot>
  );
}

/** @deprecated استخدم FinanceSubNav */
export const FinanceMobileNav = FinanceSubNav;
