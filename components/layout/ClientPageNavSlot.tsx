'use client';

import { useEffect } from 'react';
import { useClientPageNav } from '@/components/layout/ClientPageNavContext';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

export default function ClientPageNavSlot() {
  const { active, open, registration, close } = useClientPageNav();
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!active || !open || !registration) return null;

  const resolvedLabel = registration.label || t('clientNav.default');

  return (
    <>
      <button
        type="button"
        aria-label={t('subnav.close')}
        className="fixed inset-0 z-[45] bg-[#1a2420]/35 backdrop-blur-[1px] animate-[fadeIn_140ms_ease-out]"
        onClick={close}
      />
      <div
        id="client-page-nav"
        role="navigation"
        aria-label={resolvedLabel}
        className="fixed top-[3.75rem] start-2 z-[50] w-[min(20rem,calc(100vw-1rem))] rounded-2xl border border-[var(--erp-border)] bg-white shadow-[0_18px_40px_rgba(31,77,58,0.16)] p-3 max-h-[min(70vh,28rem)] overflow-y-auto animate-[switcherIn_180ms_cubic-bezier(0.22,1,0.36,1)]"
      >
        <div className="flex items-center justify-between gap-2 mb-3 px-1">
          <p className="text-xs font-bold text-[var(--erp-muted)]">{resolvedLabel}</p>
          <button
            type="button"
            onClick={close}
            className="touch-target rounded-lg border border-[var(--erp-border)] text-sm text-[var(--erp-muted)]"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {registration.items.map((item) => {
            const isActive = item.id === registration.activeId;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  close();
                  registration.onNavigate(item.id);
                }}
                className={`module-tab-bar__item inline-flex items-center justify-start gap-2 rounded-xl text-sm font-semibold transition px-3.5 py-2.5 min-h-[44px] w-full ${
                  isActive
                    ? 'bg-[var(--erp-primary)] text-white shadow-sm'
                    : 'bg-white border border-[var(--erp-border)] text-[var(--erp-text)] hover:bg-[var(--erp-page)]'
                }`}
              >
                {item.icon ? (
                  <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center text-base">
                    {item.icon}
                  </span>
                ) : null}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
