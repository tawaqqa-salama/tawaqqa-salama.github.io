export type { AppLocale } from '@/lib/i18n/types';
export type { TranslationKey } from '@/lib/i18n/dictionary';
export { LOCALE_STORAGE_KEY, isAppLocale, localeDir } from '@/lib/i18n/types';
export {
  translations,
  translate,
  translateNavLabel,
  translateNavDescription,
  translateFinanceNavLabel,
  translateSettingsSub,
  translateProfileText,
  translateRoleCode,
} from '@/lib/i18n/dictionary';
export { LanguageProvider, useLanguage, useLanguageOptional } from '@/lib/i18n/LanguageProvider';
