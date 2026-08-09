'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ProjectStagesDrawerContextValue = {
  /** ملف مشروع مفتوح — زر ☰ يتحكم بمسار المراحل */
  active: boolean;
  open: boolean;
  register: () => void;
  unregister: () => void;
  toggle: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const ProjectStagesDrawerContext = createContext<ProjectStagesDrawerContextValue | null>(null);

export function ProjectStagesDrawerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(false);

  const register = useCallback(() => {
    setActive(true);
    setOpen(false);
  }, []);

  const unregister = useCallback(() => {
    setActive(false);
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({
      active,
      open,
      register,
      unregister,
      toggle,
      openDrawer,
      closeDrawer,
    }),
    [active, open, register, unregister, toggle, openDrawer, closeDrawer]
  );

  return (
    <ProjectStagesDrawerContext.Provider value={value}>{children}</ProjectStagesDrawerContext.Provider>
  );
}

export function useProjectStagesDrawer() {
  const ctx = useContext(ProjectStagesDrawerContext);
  if (!ctx) {
    return {
      active: false,
      open: false,
      register: () => undefined,
      unregister: () => undefined,
      toggle: () => undefined,
      openDrawer: () => undefined,
      closeDrawer: () => undefined,
    };
  }
  return ctx;
}
