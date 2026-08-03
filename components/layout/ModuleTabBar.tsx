'use client';

import Link from 'next/link';
import { useModuleSubNav } from '@/components/layout/ModuleSubNavContext';

export type ModuleTabItem = {
  id: string;
  label: string;
  /** Optional link mode (finance/settings). If set, renders <Link> instead of button. */
  href?: string;
};

type ModuleTabBarProps = {
  items: ModuleTabItem[];
  activeId: string;
  onChange?: (id: string) => void;
  ariaLabel: string;
  /** Tailwind accent for active button tabs, e.g. bg-purple-600 */
  activeClassName?: string;
  idleClassName?: string;
};

/**
 * تبويبات الأقسام — سطح المكتب: صف أفقي قابل للتمرير.
 * الجوال (داخل قائمة ☰): أزرار عمودية بعرض كامل بدون تداخل.
 */
export default function ModuleTabBar({
  items,
  activeId,
  onChange,
  ariaLabel,
  activeClassName = 'bg-[var(--erp-primary)] text-white shadow-sm',
  idleClassName = 'bg-white border border-[var(--erp-border)] text-[var(--erp-text)] hover:bg-[var(--erp-page)]',
}: ModuleTabBarProps) {
  const { isMobile } = useModuleSubNav();

  const baseBtn =
    'module-tab-bar__item inline-flex items-center justify-start sm:justify-center gap-1 rounded-xl text-sm font-semibold transition px-3.5 py-2.5 min-h-[44px] shrink-0';

  if (isMobile) {
    return (
      <div className="module-tab-bar module-tab-bar--mobile flex flex-col gap-2" role="tablist" aria-label={ariaLabel}>
        {items.map((item) => {
          const active = item.id === activeId;
          const className = `${baseBtn} w-full ${active ? activeClassName : idleClassName}`;
          if (item.href) {
            return (
              <Link
                key={item.id}
                href={item.href}
                role="tab"
                aria-selected={active}
                className={className}
              >
                {item.label}
              </Link>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange?.(item.id)}
              className={className}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="module-tab-bar module-tab-bar--desktop bg-white border border-[var(--erp-border)] rounded-xl p-1.5 overflow-x-auto"
      role="navigation"
      aria-label={ariaLabel}
    >
      <div className="flex gap-1.5 min-w-max" role="tablist" aria-label={ariaLabel}>
        {items.map((item) => {
          const active = item.id === activeId;
          const className = `${baseBtn} whitespace-nowrap !min-w-0 ${
            active ? activeClassName : idleClassName
          }`;
          if (item.href) {
            return (
              <Link
                key={item.id}
                href={item.href}
                role="tab"
                aria-selected={active}
                className={className}
              >
                {item.label}
              </Link>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange?.(item.id)}
              className={className}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
