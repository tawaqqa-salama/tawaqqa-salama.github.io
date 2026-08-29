'use client';

import { useEffect } from 'react';
import { useProjectStagesDrawer } from '@/components/layout/ProjectStagesDrawerContext';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

export default function ProjectStagesNavSlot() {
  const { active, open, registration, closeDrawer } = useProjectStagesDrawer();
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeDrawer]);

  if (!active || !open || !registration?.panel) return null;

  const resolvedLabel = registration.label || t('subnav.projects');

  return (
    <>
      <button
        type="button"
        aria-label={t('subnav.close')}
        className="fixed inset-0 z-[45] bg-[#1a2420]/35 backdrop-blur-[1px] animate-[fadeIn_140ms_ease-out]"
        onClick={closeDrawer}
      />
      <div
        id="project-stages-drawer"
        role="navigation"
        aria-label={resolvedLabel}
        className="fixed top-[3.75rem] start-2 z-[50] w-[min(20rem,calc(100vw-1rem))] rounded-2xl border border-[var(--erp-border)] bg-white shadow-[0_18px_40px_rgba(31,77,58,0.16)] p-3 max-h-[min(70vh,28rem)] overflow-y-auto animate-[switcherIn_180ms_cubic-bezier(0.22,1,0.36,1)]"
      >
        <div className="flex items-center justify-between gap-2 mb-3 px-1">
          <p className="text-xs font-bold text-[var(--erp-muted)]">{resolvedLabel}</p>
          <button
            type="button"
            onClick={closeDrawer}
            className="touch-target rounded-lg border border-[var(--erp-border)] text-sm text-[var(--erp-muted)]"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        <div
          onClick={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('button[disabled]')) return;
            if (target?.closest('button,a')) closeDrawer();
          }}
        >
          {registration.panel}
        </div>
      </div>
    </>
  );
}
