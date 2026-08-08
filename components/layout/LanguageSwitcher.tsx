'use client';

import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { SUPPORTED_LOCALES, localeLabel, type AppLocale } from '@/lib/i18n/types';

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
      {SUPPORTED_LOCALES.map((locale, index) => (
        <span key={locale} className="inline-flex items-center">
          {index > 0 ? (
            <span className="lang-switcher__sep" aria-hidden="true">
              |
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => select(locale)}
            className={`lang-switcher__btn ${lang === locale ? 'is-active' : ''}`}
            aria-pressed={lang === locale}
            title={localeLabel(locale)}
          >
            {locale === 'ar' ? 'Ar' : locale === 'id' ? 'Id' : 'En'}
          </button>
        </span>
      ))}
    </div>
  );
}
