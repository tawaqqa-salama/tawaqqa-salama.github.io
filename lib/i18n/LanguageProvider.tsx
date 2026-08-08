'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  translate,
  translateFinanceNavLabel,
  translateFinanceStoredLabel,
  translateNavDescription,
  translateNavLabel,
  translateProfileText,
  translateRoleCode,
  translateSettingsSub,
  type TranslationKey,
} from '@/lib/i18n/dictionary';
import {
  isAppLocale,
  localeDir,
  LOCALE_STORAGE_KEY,
  HEADER_LOCALES,
  type AppLocale,
} from '@/lib/i18n/types';

type LanguageContextValue = {
  lang: AppLocale;
  dir: 'rtl' | 'ltr';
  setLang: (lang: AppLocale) => void;
  toggleLang: () => void;
  t: (key: TranslationKey | string, vars?: Record<string, string | number>) => string;
  tNav: (href: string, fallback?: string) => string;
  tNavDesc: (href: string, fallback?: string) => string;
  tFinance: (href: string, fallback: string) => string;
  tFinanceLabel: (text: string | null | undefined) => string;
  tSettingsSub: (pathname: string) => string | null;
  tProfile: (text: string | null | undefined, fallbackKey?: TranslationKey) => string;
  tRole: (roleCode: string | null | undefined) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function applyDocumentLocale(lang: AppLocale) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = lang;
  root.dir = localeDir(lang);
  root.dataset.lang = lang;
  root.style.colorScheme = 'light';
}

function readStoredLocale(): AppLocale {
  if (typeof window === 'undefined') return 'ar';
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isAppLocale(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return 'ar';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLocale>('ar');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredLocale();
    setLangState(stored);
    applyDocumentLocale(stored);
    setReady(true);
  }, []);

  const setLang = useCallback((next: AppLocale) => {
    setLangState(next);
    applyDocumentLocale(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleLang = useCallback(() => {
    // Header toggle cycles Ar ↔ En only; Indonesian is set from company settings
    const current = HEADER_LOCALES.includes(lang) ? lang : 'en';
    const idx = HEADER_LOCALES.indexOf(current);
    setLang(HEADER_LOCALES[(idx + 1) % HEADER_LOCALES.length]);
  }, [lang, setLang]);

  const value = useMemo<LanguageContextValue>(() => {
    return {
      lang,
      dir: localeDir(lang),
      setLang,
      toggleLang,
      t: (key, vars) => translate(lang, key, vars),
      tNav: (href, fallback) => translateNavLabel(lang, href, fallback),
      tNavDesc: (href, fallback) => translateNavDescription(lang, href, fallback),
      tFinance: (href, fallback) => translateFinanceNavLabel(lang, href, fallback),
      tFinanceLabel: (text) => translateFinanceStoredLabel(lang, text),
      tSettingsSub: (pathname) => translateSettingsSub(lang, pathname),
      tProfile: (text, fallbackKey) => translateProfileText(lang, text, fallbackKey),
      tRole: (roleCode) => translateRoleCode(lang, roleCode),
    };
  }, [lang, setLang, toggleLang]);

  return (
    <LanguageContext.Provider value={value}>
      <div
        lang={lang}
        dir={localeDir(lang)}
        data-lang={lang}
        data-i18n-ready={ready ? '1' : '0'}
        className="contents"
      >
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}

/** Safe hook for optional usage outside provider (returns Arabic defaults). */
export function useLanguageOptional(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  return {
    lang: 'ar',
    dir: 'rtl',
    setLang: () => undefined,
    toggleLang: () => undefined,
    t: (key, vars) => translate('ar', key, vars),
    tNav: (href, fallback) => translateNavLabel('ar', href, fallback),
    tNavDesc: (href, fallback) => translateNavDescription('ar', href, fallback),
    tFinance: (href, fallback) => translateFinanceNavLabel('ar', href, fallback),
    tFinanceLabel: (text) => translateFinanceStoredLabel('ar', text),
    tSettingsSub: (pathname) => translateSettingsSub('ar', pathname),
    tProfile: (text, fallbackKey) => translateProfileText('ar', text, fallbackKey),
    tRole: (roleCode) => translateRoleCode('ar', roleCode),
  };
}
