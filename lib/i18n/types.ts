export type AppLocale = 'ar' | 'en' | 'id';

export const LOCALE_STORAGE_KEY = 'tawaqqa_lang';

export const SUPPORTED_LOCALES: AppLocale[] = ['ar', 'en', 'id'];

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
