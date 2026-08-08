'use client';

import { useLanguage } from '@/lib/i18n/LanguageProvider';
import {
  HEADER_LOCALES,
  SUPPORTED_LOCALES,
  localeLabel,
  localeShortCode,
  type AppLocale,
} from '@/lib/i18n/types';

type LanguageSwitcherProps = {
  className?: string;
  /**
   * `header` (default): Ar | En only — used on home/header.
   * `full`: Ar | En | Id — company settings / tenant regional options.
   */
  variant?: 'header' | 'full';
  /** Optional explicit locale list (overrides variant). */
  locales?: AppLocale[];
};

export default function LanguageSwitcher({
  className = '',
  variant = 'header',
  locales,
}: LanguageSwitcherProps) {
  const { lang, setLang, t } = useLanguage();
  const options = locales ?? (variant === 'full' ? SUPPORTED_LOCALES : HEADER_LOCALES);

  const select = (next: AppLocale) => {
    if (next !== lang) setLang(next);
  };

  return (
    <div
      className={`lang-switcher inline-flex items-center rounded-full border border-[var(--erp-border)] bg-white p-0.5 shadow-sm ${className}`}
      role="group"
      aria-label={t('common.language')}
    >
      {options.map((locale, index) => (
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
            {localeShortCode(locale)}
          </button>
        </span>
      ))}
    </div>
  );
}
