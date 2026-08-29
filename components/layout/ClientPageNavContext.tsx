'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ClientPageNavItem = {
  id: string;
  label: string;
  icon?: string;
};

type ClientPageNavRegistration = {
  items: ClientPageNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  label?: string;
};

type ClientPageNavContextValue = {
  active: boolean;
  open: boolean;
  registration: ClientPageNavRegistration | null;
  register: (registration: ClientPageNavRegistration) => void;
  unregister: () => void;
  toggle: () => void;
  close: () => void;
};

const ClientPageNavContext = createContext<ClientPageNavContextValue | null>(null);

export function ClientPageNavProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<ClientPageNavRegistration | null>(null);
  const [open, setOpen] = useState(false);

  const register = useCallback((next: ClientPageNavRegistration) => {
    setRegistration(next);
    setOpen(false);
  }, []);

  const unregister = useCallback(() => {
    setRegistration(null);
    setOpen(false);
  }, []);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({
      active: Boolean(registration),
      open,
      registration,
      register,
      unregister,
      toggle,
      close,
    }),
    [registration, open, register, unregister, toggle, close]
  );

  return <ClientPageNavContext.Provider value={value}>{children}</ClientPageNavContext.Provider>;
}

export function useClientPageNav() {
  const ctx = useContext(ClientPageNavContext);
  if (!ctx) {
    return {
      active: false,
      open: false,
      registration: null as ClientPageNavRegistration | null,
      register: () => undefined,
      unregister: () => undefined,
      toggle: () => undefined,
      close: () => undefined,
    };
  }
  return ctx;
}
