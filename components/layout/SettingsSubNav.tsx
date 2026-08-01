'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';

const SETTINGS_LINKS = [
  { href: '/settings', label: 'نظرة عامة', exact: true },
  { href: '/settings/company', label: 'معلومات الشركة' },
  { href: '/settings/users', label: 'المستخدمون' },
  { href: '/settings/zatca', label: 'ZATCA' },
] as const;

export default function SettingsSubNav() {
  const pathname = usePathname();
  const { canAccess, canManageStaff } = useAuth();

  const links = SETTINGS_LINKS.filter((item) => {
    if (item.href === '/settings/users') return canManageStaff;
    if (item.href === '/settings') return canAccess('settings') || canManageStaff;
    return canAccess('settings');
  });

  if (links.length === 0) return null;

  return (
    <ModuleSubNavSlot label="تبويبات الإعدادات">
      <div className="bg-white border border-[var(--erp-border)] rounded-xl p-1.5 overflow-x-auto">
        <div className="flex gap-1 min-w-max" role="tablist" aria-label="تبويبات الإعدادات">
          {links.map((item) => {
            const active = 'exact' in item && item.exact
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
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </ModuleSubNavSlot>
  );
}
