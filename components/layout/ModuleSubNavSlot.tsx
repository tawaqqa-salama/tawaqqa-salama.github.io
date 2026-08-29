'use client';

import { useEffect, type ReactNode } from 'react';
import { useModuleSubNav } from '@/components/layout/ModuleSubNavContext';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

type ModuleSubNavSlotProps = {
  children: ReactNode;
  /** تسمية وصول للقائمة — يُفضّل مفتاح ترجمة أو نص جاهز */
  label?: string;
  className?: string;
};

/**
 * يغلّف تبويبات/قوائم القسم الفرعية ويخضعها لزر ☰ في الهيدر.
 * القائمة مخفية افتراضياً وتُفتح كلوحة منسدلة مع إغلاق عند الضغط خارجها.
 */
export default function ModuleSubNavSlot({
  children,
  label,
  className = '',
}: ModuleSubNavSlotProps) {
  const { open, closeSubNav, hasSubNav } = useModuleSubNav();
  const { t } = useLanguage();
  const resolvedLabel = label || t('subnav.default');

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSubNav();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeSubNav]);

  if (!hasSubNav || !open) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t('subnav.close')}
        className="fixed inset-0 z-[45] bg-[#1a2420]/35 backdrop-blur-[1px] animate-[fadeIn_140ms_ease-out]"
        onClick={closeSubNav}
      />
      <div
        id="module-subnav"
        role="navigation"
        aria-label={resolvedLabel}
        className={`
          fixed top-[3.75rem] start-2 z-[50]
          w-[min(20rem,calc(100vw-1rem))]
          rounded-2xl border border-[var(--erp-border)] bg-white
          shadow-[0_18px_40px_rgba(31,77,58,0.16)]
          p-3 max-h-[min(70vh,28rem)] overflow-y-auto
          animate-[switcherIn_180ms_cubic-bezier(0.22,1,0.36,1)]
          ${className}
        `}
      >
        <div className="flex items-center justify-between gap-2 mb-3 px-1">
          <p className="text-xs font-bold text-[var(--erp-muted)]">{resolvedLabel}</p>
          <button
            type="button"
            onClick={closeSubNav}
            className="touch-target rounded-lg border border-[var(--erp-border)] text-sm text-[var(--erp-muted)]"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        <div
          onClick={(event) => {
            const target = event.target as HTMLElement | null;
            const button = target?.closest('button');
            if (button?.hasAttribute('aria-expanded')) return;
            if (target?.closest('a,[role="tab"]')) closeSubNav();
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
