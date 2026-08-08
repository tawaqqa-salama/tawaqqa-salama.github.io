export type AppLocale = 'ar' | 'en' | 'id';

export const LOCALE_STORAGE_KEY = 'tawaqqa_lang';

/** All locales the app can render (includes Indonesian for tenant/company settings). */
export const SUPPORTED_LOCALES: AppLocale[] = ['ar', 'en', 'id'];

/** Locales shown in the global header / home language switcher. */
export const HEADER_LOCALES: AppLocale[] = ['ar', 'en'];

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'ar' || value === 'en' || value === 'id';
}

export function localeDir(locale: AppLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function localeLabel(locale: AppLocale): string {
  if (locale === 'ar') return 'العربية';
  if (locale === 'id') return 'Bahasa Indonesia';
  return 'English';
}

export function localeShortCode(locale: AppLocale): string {
  if (locale === 'ar') return 'Ar';
  if (locale === 'id') return 'Id';
  return 'En';
}
