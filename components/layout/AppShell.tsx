'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import AppHeader from '@/components/layout/AppHeader';
import ActivityTracker from '@/components/layout/ActivityTracker';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { ModuleSubNavProvider } from '@/components/layout/ModuleSubNavContext';
import SupabaseConfigBanner from '@/components/ui/SupabaseConfigBanner';
import { onDocumentPreviewMountRequest } from '@/lib/print/document-preview';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { DepartmentId } from '@/lib/constants/navigation';
import { DEPARTMENT_TO_MODULE } from '@/lib/tenant/types';
import { isSuperAdminRole } from '@/lib/tenant/rbac';

const DocumentPreviewSheet = dynamic(() => import('@/components/ui/DocumentPreviewSheet'), {
  ssr: false,
});

const PUBLIC_PATHS = ['/login', '/onboarding', '/platform'];

const ROUTE_DEPARTMENT: Record<string, DepartmentId> = {
  '/marketing': 'marketing',
  '/sales': 'sales',
  '/procurement': 'procurement',
  '/finance': 'finance',
  '/hr': 'hr',
  '/projects': 'projects',
  '/design': 'design',
  '/settings': 'settings',
};

function resolveDepartment(pathname: string): DepartmentId | null {
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/finance')) return 'finance';
  for (const [prefix, department] of Object.entries(ROUTE_DEPARTMENT)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return department;
  }
  return null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, loading, canAccess, canManageStaff } = useAuth();
  const { t } = useLanguage();
  const [previewMounted, setPreviewMounted] = useState(false);
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null);

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  useEffect(() => onDocumentPreviewMountRequest(() => setPreviewMounted(true)), []);

  useEffect(() => {
    if (!session || isPublic) return;
    void fetch('/api/tenant/context')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.modules)) setEnabledModules(j.modules);
        else setEnabledModules([]);
      })
      .catch(() => setEnabledModules([]));
  }, [session, isPublic]);

  useEffect(() => {
    if (loading) return;
    if (!session && !isPublic) {
      router.replace('/login');
      return;
    }
    if (session && pathname === '/login') {
      router.replace('/me');
      return;
    }
    if (!session) return;

    if (pathname.startsWith('/platform') && !isSuperAdminRole(session.roleCode)) {
      router.replace('/me');
      return;
    }

    const department = resolveDepartment(pathname);
    if (department && !canAccess(department)) {
      if (
        department === 'settings' &&
        (pathname.startsWith('/settings/users') || pathname.startsWith('/settings/activity')) &&
        canManageStaff
      ) {
        return;
      }
      if (department === 'settings' && !canAccess('settings') && !canManageStaff) {
        router.replace('/me');
        return;
      }
      if (department !== 'settings') {
        router.replace('/me');
      }
      return;
    }

    // Module feature flags (UI gate — APIs also enforce via requireModule)
    if (
      department &&
      enabledModules &&
      enabledModules.length > 0 &&
      !isSuperAdminRole(session.roleCode)
    ) {
      const mod = DEPARTMENT_TO_MODULE[department];
      if (mod && !enabledModules.includes(mod)) {
        router.replace('/me');
      }
    }
  }, [loading, session, isPublic, pathname, router, canAccess, canManageStaff, enabledModules]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#eef2ef] text-[#1f4d3a]">
        {t('shell.checkingSession')}
      </div>
    );
  }

  if (isPublic || !session) {
    return (
      <div className="min-h-screen w-full bg-[#eef2ef] overflow-x-hidden relative">
        <div className="absolute top-4 left-4 z-50">
          <LanguageSwitcher />
        </div>
        {children}
        {previewMounted ? <DocumentPreviewSheet /> : null}
      </div>
    );
  }

  return (
    <ModuleSubNavProvider>
      <div className="flex-1 flex flex-col min-w-0 w-full h-full overflow-hidden">
        <Suspense fallback={<div className="h-[57px] border-b bg-white shrink-0" />}>
          <AppHeader />
        </Suspense>
        <SupabaseConfigBanner />
        <ActivityTracker />
        <main className="flex-1 p-3 sm:p-5 md:p-6 overflow-y-auto overflow-x-hidden w-full max-w-none">
          {children}
        </main>
        {previewMounted ? <DocumentPreviewSheet /> : null}
      </div>
    </ModuleSubNavProvider>
  );
}
