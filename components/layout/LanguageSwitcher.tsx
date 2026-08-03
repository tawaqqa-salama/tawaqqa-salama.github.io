'use client';

import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { AppLocale } from '@/lib/i18n/types';

type LanguageSwitcherProps = {
  className?: string;
};

export default function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { lang, setLang, t } = useLanguage();

  const select = (next: AppLocale) => {
    if (next !== lang) setLang(next);
  };

  return (
    <div
      className={`lang-switcher inline-flex items-center rounded-full border border-[var(--erp-border)] bg-white p-0.5 shadow-sm ${className}`}
      role="group"
      aria-label={t('common.language')}
    >
      <button
        type="button"
        onClick={() => select('ar')}
        className={`lang-switcher__btn ${lang === 'ar' ? 'is-active' : ''}`}
        aria-pressed={lang === 'ar'}
        title={t('common.arabic')}
      >
        Ar
      </button>
      <span className="lang-switcher__sep" aria-hidden="true">
        |
      </span>
      <button
        type="button"
        onClick={() => select('en')}
        className={`lang-switcher__btn ${lang === 'en' ? 'is-active' : ''}`}
        aria-pressed={lang === 'en'}
        title={t('common.english')}
      >
        En
      </button>
    </div>
  );
}
