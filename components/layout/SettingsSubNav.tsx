'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

const SETTINGS_LINKS = [
  { href: '/settings', key: 'settings.overview', exact: true },
  { href: '/settings/company', key: 'settings.companyShort' },
  { href: '/settings/users', key: 'settings.usersShort' },
  { href: '/settings/activity', key: 'settings.activity' },
  { href: '/settings/zatca', key: 'settings.zatcaShort' },
  { href: '/settings/building-code', key: 'settings.buildingCodeShort' },
] as const;

export default function SettingsSubNav() {
  const pathname = usePathname();
  const { canAccess, canManageStaff } = useAuth();
  const { t } = useLanguage();

  const links = SETTINGS_LINKS.filter((item) => {
    if (item.href === '/settings/users' || item.href === '/settings/activity') return canManageStaff;
    if (item.href === '/settings') return canAccess('settings') || canManageStaff;
    return canAccess('settings');
  });

  if (links.length === 0) return null;

  return (
    <ModuleSubNavSlot label={t('settings.tabs')}>
      <div className="bg-white border border-[var(--erp-border)] rounded-xl p-1.5 overflow-x-auto">
        <div className="flex gap-1 min-w-max" role="tablist" aria-label={t('settings.tabs')}>
          {links.map((item) => {
            const active =
              'exact' in item && item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                role="tab"
                aria-selected={active}
                className={`
                  touch-target !h-auto px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition
                  ${
                    active
                      ? 'bg-[var(--erp-primary)] text-white shadow-sm'
                      : 'text-[var(--erp-muted)] hover:bg-[var(--erp-page)] hover:text-[var(--erp-text)]'
                  }
                `}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </div>
      </div>
    </ModuleSubNavSlot>
  );
}
