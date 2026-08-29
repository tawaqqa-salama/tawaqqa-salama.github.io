'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ModuleTabBar from '@/components/layout/ModuleTabBar';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

const SETTINGS_LINKS = [
  { href: '/settings', id: 'overview', key: 'settings.overview', exact: true },
  { href: '/settings/company', id: 'company', key: 'settings.companyShort' },
  { href: '/settings/users', id: 'users', key: 'settings.usersShort' },
  { href: '/settings/activity', id: 'activity', key: 'settings.activity' },
  { href: '/settings/zatca', id: 'zatca', key: 'settings.zatcaShort' },
  { href: '/settings/building-code', id: 'building-code', key: 'settings.buildingCodeShort' },
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

  let activeId = links[0]?.id || 'overview';
  for (const item of links) {
    const active =
      'exact' in item && item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (active) {
      activeId = item.id;
      break;
    }
  }

  return (
    <ModuleSubNavSlot label={t('settings.tabs')}>
      <ModuleTabBar
        items={links.map((item) => ({
          id: item.id,
          label: item.id === 'overview' ? t('subnav.dashboard') : t(item.key),
          href: item.href,
        }))}
        activeId={activeId}
        ariaLabel={t('settings.tabs')}
      />
    </ModuleSubNavSlot>
  );
}
