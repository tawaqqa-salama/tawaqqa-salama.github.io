'use client';

import { useEffect, useId, useRef, useState } from 'react';

type ClientPageTarget = 'basic' | 'quotation' | 'contract';

type ClientPageNavigationProps = {
  active: 'basic' | 'quotation';
  onNavigate: (target: ClientPageTarget) => void;
};

const ITEMS: Array<{ id: ClientPageTarget; label: string; icon: string }> = [
  { id: 'basic', label: 'البيانات الأساسية', icon: '▣' },
  { id: 'quotation', label: 'عرض السعر', icon: '▤' },
  { id: 'contract', label: 'العقد', icon: '✎' },
];

export default function ClientPageNavigation({ active, onNavigate }: ClientPageNavigationProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const handleOutsidePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleOutsidePointer);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsidePointer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative z-30">
      <button
        type="button"
        aria-label="فتح قائمة صفحات العميل"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-lg font-bold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <span aria-hidden="true">☰</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="صفحات العميل"
          className="absolute right-0 top-full mt-2 min-w-[13rem] rounded-xl border border-slate-200 bg-white p-1.5 text-right shadow-xl"
        >
          {ITEMS.map((item) => {
            const isActive = item.id !== 'contract' && item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  setOpen(false);
                  onNavigate(item.id);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center text-base">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
