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
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'tawaqqa_module_subnav_v1';
const MOBILE_QUERY = '(max-width: 767px)';

/** أقسام لديها قوائم/تبويبات فرعية قابلة للإخفاء عبر زر ☰ */
const MODULES_WITH_SUBNAV = new Set([
  'marketing',
  'sales',
  'procurement',
  'finance',
  'hr',
  'settings',
]);

export type ModuleSubNavKey =
  | 'marketing'
  | 'sales'
  | 'procurement'
  | 'finance'
  | 'hr'
  | 'projects'
  | 'settings'
  | null;

type StoredPrefs = Record<string, boolean>;

type ModuleSubNavContextValue = {
  moduleKey: ModuleSubNavKey;
  hasSubNav: boolean;
  open: boolean;
  isMobile: boolean;
  toggleSubNav: () => void;
  openSubNav: () => void;
  closeSubNav: () => void;
  setSubNavOpen: (next: boolean) => void;
};

const ModuleSubNavContext = createContext<ModuleSubNavContextValue | null>(null);

function resolveModuleKey(pathname: string): ModuleSubNavKey {
  if (pathname.startsWith('/marketing')) return 'marketing';
  if (pathname.startsWith('/sales')) return 'sales';
  if (pathname.startsWith('/procurement')) return 'procurement';
  if (pathname.startsWith('/finance')) return 'finance';
  if (pathname.startsWith('/hr')) return 'hr';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/settings')) return 'settings';
  return null;
}

function readPrefs(): StoredPrefs {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPrefs) : {};
  } catch {
    return {};
  }
}

function writePrefs(prefs: StoredPrefs) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function defaultOpenForViewport(isMobile: boolean): boolean {
  // الجوال: مخفية افتراضياً — سطح المكتب: ظاهرة
  return !isMobile;
}

export function ModuleSubNavProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const moduleKey = resolveModuleKey(pathname);
  const hasSubNav = Boolean(moduleKey && MODULES_WITH_SUBNAV.has(moduleKey));

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  );
  const [open, setOpen] = useState(() =>
    typeof window !== 'undefined' ? !window.matchMedia(MOBILE_QUERY).matches : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!moduleKey || !hasSubNav) {
      setOpen(false);
      return;
    }
    const prefs = readPrefs();
    if (typeof prefs[moduleKey] === 'boolean') {
      setOpen(prefs[moduleKey]);
      return;
    }
    setOpen(defaultOpenForViewport(isMobile));
  }, [moduleKey, hasSubNav, isMobile]);

  const persist = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!moduleKey) return;
      const prefs = readPrefs();
      prefs[moduleKey] = next;
      writePrefs(prefs);
    },
    [moduleKey]
  );

  const toggleSubNav = useCallback(() => persist(!open), [open, persist]);
  const openSubNav = useCallback(() => persist(true), [persist]);
  const closeSubNav = useCallback(() => persist(false), [persist]);

  const value = useMemo(
    () => ({
      moduleKey,
      hasSubNav,
      open,
      isMobile,
      toggleSubNav,
      openSubNav,
      closeSubNav,
      setSubNavOpen: persist,
    }),
    [moduleKey, hasSubNav, open, isMobile, toggleSubNav, openSubNav, closeSubNav, persist]
  );

  return <ModuleSubNavContext.Provider value={value}>{children}</ModuleSubNavContext.Provider>;
}

export function useModuleSubNav() {
  const ctx = useContext(ModuleSubNavContext);
  if (!ctx) {
    return {
      moduleKey: null as ModuleSubNavKey,
      hasSubNav: false,
      open: true,
      isMobile: false,
      toggleSubNav: () => undefined,
      openSubNav: () => undefined,
      closeSubNav: () => undefined,
      setSubNavOpen: () => undefined,
    };
  }
  return ctx;
}
