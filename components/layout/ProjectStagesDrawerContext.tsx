'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ProjectStagesRegistration = {
  panel: ReactNode;
  label?: string;
};

type ProjectStagesDrawerContextValue = {
  /** ملف مشروع مفتوح — زر ☰ يتحكم بمسار المراحل */
  active: boolean;
  open: boolean;
  registration: ProjectStagesRegistration | null;
  register: (registration: ProjectStagesRegistration) => void;
  unregister: () => void;
  toggle: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const ProjectStagesDrawerContext = createContext<ProjectStagesDrawerContextValue | null>(null);

export function ProjectStagesDrawerProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<ProjectStagesRegistration | null>(null);
  const [open, setOpen] = useState(false);

  const register = useCallback((next: ProjectStagesRegistration) => {
    setRegistration(next);
    setOpen(false);
  }, []);

  const unregister = useCallback(() => {
    setRegistration(null);
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({
      active: Boolean(registration),
      open,
      registration,
      register,
      unregister,
      toggle,
      openDrawer,
      closeDrawer,
    }),
    [registration, open, register, unregister, toggle, openDrawer, closeDrawer]
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
      registration: null as ProjectStagesRegistration | null,
      register: () => undefined,
      unregister: () => undefined,
      toggle: () => undefined,
      openDrawer: () => undefined,
      closeDrawer: () => undefined,
    };
  }
  return ctx;
}
