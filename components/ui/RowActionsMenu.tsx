'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type RowActionItem = {
  id: string;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'success' | 'danger';
};

const TONE_CLASS: Record<NonNullable<RowActionItem['tone']>, string> = {
  default: 'text-gray-700',
  primary: 'text-blue-700',
  success: 'text-emerald-700',
  danger: 'text-rose-700',
};

type RowActionsMenuProps = {
  items: RowActionItem[];
  label?: string;
};

/** قائمة إجراءات مضغوطة للجدول — مناسبة للجوال وسطح المكتب */
export default function RowActionsMenu({ items, label = 'إجراءات' }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative inline-flex justify-end w-full sm:w-auto">
      {/* سطح المكتب: أزرار في سطر واحد */}
      <div className="hidden md:flex flex-nowrap items-center gap-1 justify-end">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={`shrink-0 text-xs px-2.5 py-1.5 rounded-lg border bg-white hover:bg-gray-50 whitespace-nowrap ${TONE_CLASS[item.tone || 'default']}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* الجوال: قائمة منسدلة */}
      <div className="md:hidden w-full flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="touch-target min-h-[40px] px-3 rounded-lg border border-[#ccc] bg-white text-xs font-semibold text-gray-700"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
        >
          {label} ▾
        </button>
        {open ? (
          <div
            id={menuId}
            role="menu"
            className="absolute top-full left-0 mt-1 z-20 min-w-[10.5rem] rounded-xl border border-[var(--erp-border)] bg-white shadow-lg py-1"
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full text-right px-3 py-2.5 text-sm font-medium hover:bg-gray-50 ${TONE_CLASS[item.tone || 'default']}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
