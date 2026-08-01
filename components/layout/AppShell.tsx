'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AppSidebar from '@/components/layout/AppSidebar';
import AppHeader from '@/components/layout/AppHeader';
import SupabaseConfigBanner from '@/components/ui/SupabaseConfigBanner';
import DocumentPreviewSheet from '@/components/ui/DocumentPreviewSheet';
import { MobileNavProvider } from '@/components/layout/MobileNavContext';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { DepartmentId } from '@/lib/constants/navigation';

const PUBLIC_PATHS = ['/login'];

const ROUTE_DEPARTMENT: Record<string, DepartmentId> = {
  '/marketing': 'marketing',
  '/sales': 'sales',
  '/procurement': 'procurement',
  '/finance': 'finance',
  '/hr': 'hr',
  '/projects': 'projects',
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

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

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

    const department = resolveDepartment(pathname);
    if (department && !canAccess(department)) {
      if (department === 'settings' && pathname.startsWith('/settings/users') && canManageStaff) {
        return;
      }
      if (department === 'settings' && !canAccess('settings') && !canManageStaff) {
        router.replace('/me');
        return;
      }
      if (department !== 'settings') {
        router.replace('/me');
      }
    }
  }, [loading, session, isPublic, pathname, router, canAccess, canManageStaff]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#eef2ef] text-[#1f4d3a]">
        جاري التحقق من الجلسة...
      </div>
    );
  }

  if (isPublic || !session) {
    return (
      <div className="min-h-screen w-full bg-[#eef2ef] overflow-x-hidden">
        {children}
        <DocumentPreviewSheet />
      </div>
    );
  }

  return (
    <MobileNavProvider>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AppHeader />
        <SupabaseConfigBanner />
        <main className="flex-1 p-3 sm:p-5 md:p-6 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
      <DocumentPreviewSheet />
    </MobileNavProvider>
  );
}
