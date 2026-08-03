'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { FINANCE_NAV } from '@/lib/constants/accounting';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ModuleTabBar from '@/components/layout/ModuleTabBar';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

function hrefPath(href: string): string {
  return href.split('?')[0] || href;
}

function hrefTab(href: string): string | null {
  const q = href.split('?')[1];
  if (!q) return null;
  return new URLSearchParams(q).get('tab');
}

function financeItemId(href: string): string {
  if (href === '/finance') return 'dashboard';
  if (href.includes('tab=approvals')) return 'approvals';
  const path = hrefPath(href);
  return path.replace('/finance/', '').replace(/\//g, '-') || 'dashboard';
}

/** تبويبات داخلية لنظام الحسابات — تُخفى/تُظهر عبر زر ☰ */
export function FinanceSubNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');
  const { t, tFinance } = useLanguage();

  let activeId = 'dashboard';
  for (const item of FINANCE_NAV) {
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
    if (isActive) {
      activeId = financeItemId(item.href);
      break;
    }
  }

  const items = FINANCE_NAV.map((item) => ({
    id: financeItemId(item.href),
    label: tFinance(item.href, item.label),
    href: item.href,
  }));

  return (
    <ModuleSubNavSlot label={t('subnav.finance')}>
      <ModuleTabBar items={items} activeId={activeId} ariaLabel={t('subnav.finance')} />
    </ModuleSubNavSlot>
  );
}

/** @deprecated استخدم FinanceSubNav */
export const FinanceMobileNav = FinanceSubNav;
