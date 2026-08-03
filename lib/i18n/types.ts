export type AppLocale = 'ar' | 'en';

export const LOCALE_STORAGE_KEY = 'tawaqqa_lang';

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'ar' || value === 'en';
}

export function localeDir(locale: AppLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
