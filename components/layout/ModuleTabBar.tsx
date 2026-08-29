'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { useModuleSubNav } from '@/components/layout/ModuleSubNavContext';

export type ModuleTabItem = {
  id: string;
  label: string;
  /** Optional link mode (finance/settings). If set, renders <Link> instead of button. */
  href?: string;
  /** Nested sub-items — expandable group with dropdown arrow */
  children?: ModuleTabItem[];
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavItem({
  item,
  activeId,
  onChange,
  activeClassName,
  idleClassName,
  depth = 0,
}: {
  item: ModuleTabItem;
  activeId: string;
  onChange?: (id: string) => void;
  activeClassName: string;
  idleClassName: string;
  depth?: number;
}) {
  const hasChildren = Boolean(item.children?.length);
  const childActive = item.children?.some(
    (child) => child.id === activeId || child.children?.some((nested) => nested.id === activeId)
  );
  const active = item.id === activeId || Boolean(childActive);
  const [expanded, setExpanded] = useState(active);

  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  const baseBtn =
    'module-tab-bar__item inline-flex items-center justify-between gap-2 rounded-xl text-sm font-semibold transition px-3.5 py-2.5 min-h-[44px] w-full';
  const className = `${baseBtn} ${active ? activeClassName : idleClassName}`;

  if (hasChildren) {
    return (
      <div className="flex flex-col gap-1.5" style={{ paddingInlineStart: depth ? '0.75rem' : undefined }}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={className}
          aria-expanded={expanded}
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            {item.href ? (
              <Link
                href={item.href}
                className="truncate"
                onClick={(event) => event.stopPropagation()}
              >
                {item.label}
              </Link>
            ) : (
              <span className="truncate">{item.label}</span>
            )}
          </span>
          <ChevronIcon open={expanded} />
        </button>
        {expanded ? (
          <div className="flex flex-col gap-1.5 border-s-2 border-[var(--erp-border)] ps-2">
            {item.children!.map((child) => (
              <NavItem
                key={child.id}
                item={child}
                activeId={activeId}
                onChange={onChange}
                activeClassName={activeClassName}
                idleClassName={idleClassName}
                depth={depth + 1}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (item.href) {
    return (
      <Link
        href={item.href}
        role="tab"
        aria-selected={active}
        className={className}
        style={{ paddingInlineStart: depth ? '1.25rem' : undefined }}
      >
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onChange?.(item.id)}
      className={className}
      style={{ paddingInlineStart: depth ? '1.25rem' : undefined }}
    >
      <span className="truncate">{item.label}</span>
    </button>
  );
}

/**
 * تبويبات الأقسام — تُعرض داخل قائمة ☰ فقط (عمودية مع دعم القوائم المتداخلة).
 */
export default function ModuleTabBar({
  items,
  activeId,
  onChange,
  ariaLabel,
  activeClassName = 'bg-[var(--erp-primary)] text-white shadow-sm',
  idleClassName = 'bg-white border border-[var(--erp-border)] text-[var(--erp-text)] hover:bg-[var(--erp-page)]',
}: ModuleTabBarProps) {
  useModuleSubNav();

  return (
    <div className="module-tab-bar module-tab-bar--drawer flex flex-col gap-2" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <NavItem
          key={item.id}
          item={item}
          activeId={activeId}
          onChange={onChange}
          activeClassName={activeClassName}
          idleClassName={idleClassName}
        />
      ))}
    </div>
  );
}
