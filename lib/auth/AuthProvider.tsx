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
import type { AppUser, AuthSession, PermissionCode } from '@/lib/auth/types';
import {
  canAccessDepartment,
  canManageUsers,
  hasPermission,
} from '@/lib/auth/permissions';
import type { DepartmentId } from '@/lib/constants/navigation';
import {
  getUserProfile,
  requestPhoneOtp,
  restoreAuthSession,
  signInWithEmailPassword,
  signOutAuth,
  verifyPhoneOtp,
} from '@/lib/auth/service';
import { syncSessionCookie } from '@/lib/auth/session';
import { logActivity } from '@/lib/activity/logger';
import { roleLabel } from '@/lib/activity/labels';

type AuthContextValue = {
  session: AuthSession | null;
  profile: AppUser | null;
  loading: boolean;
  permissions: PermissionCode[];
  canAccess: (department: DepartmentId) => boolean;
  canManageStaff: boolean;
  has: (permission: PermissionCode) => boolean;
  loginWithEmail: (email: string, password: string) => Promise<string | null>;
  sendPhoneCode: (phone: string) => Promise<{ error: string | null; demoOtp?: string }>;
  loginWithPhone: (phone: string, code: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      // Hard cap so GitHub Pages / slow Supabase can never leave the UI stuck
      const result = await Promise.race([
        restoreAuthSession(),
        new Promise<{ session: null; error: string }>((resolve) =>
          setTimeout(() => resolve({ session: null, error: 'session_timeout' }), 6000)
        ),
      ]);
      const next = result.session;
      setSession(next);
      if (next) {
        try {
          const user = await Promise.race([
            getUserProfile(next.userId),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
          ]);
          setProfile(user);
          // Never block UI on cookie sync (absent on GitHub Pages)
          void syncSessionCookie(next, user?.company_id || next.companyId || undefined);
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
    } catch {
      setSession(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const result = await signInWithEmailPassword(email, password);
      if (result.error || !result.session) return result.error || 'فشل تسجيل الدخول';
      setSession(result.session);
      // Side-effects must never fail the login UX
      try {
        void getUserProfile(result.session.userId).then((user) => setProfile(user));
        void syncSessionCookie(result.session, result.session.companyId || undefined);
        void logActivity({
          actionType: 'LOGIN',
          details: `تسجيل دخول ناجح (${result.session.fullName || ''}) عبر البريد`,
          pageUrl: '/login',
          module: 'auth',
          actor: {
            userId: result.session.userId,
            userName: result.session.fullName || result.session.email,
            userRole: result.session.roleCode,
          },
          metadata: { method: 'email', role: roleLabel(result.session.roleCode) },
        });
      } catch {
        // ignore post-login side effects
      }
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      return msg || 'تعذر إكمال تسجيل الدخول. حاول مرة أخرى.';
    }
  }, []);

  const sendPhoneCode = useCallback(async (phone: string) => {
    try {
      return await Promise.race([
        requestPhoneOtp(phone),
        new Promise<{ error: string }>((resolve) =>
          setTimeout(() => resolve({ error: 'انتهت مهلة إرسال رمز التحقق.' }), 12_000)
        ),
      ]);
    } catch {
      return { error: 'تعذر إرسال رمز التحقق.' };
    }
  }, []);

  const loginWithPhone = useCallback(async (phone: string, code: string) => {
    try {
      const result = await verifyPhoneOtp(phone, code);
      if (result.error || !result.session) return result.error || 'فشل تسجيل الدخول';
      setSession(result.session);
      try {
        void getUserProfile(result.session.userId).then((user) => setProfile(user));
        void syncSessionCookie(result.session, result.session.companyId || undefined);
        void logActivity({
          actionType: 'LOGIN',
          details: `تسجيل دخول ناجح (${result.session.fullName || ''}) عبر الجوال`,
          pageUrl: '/login',
          module: 'auth',
          actor: {
            userId: result.session.userId,
            userName: result.session.fullName || result.session.email,
            userRole: result.session.roleCode,
          },
          metadata: { method: 'phone', role: roleLabel(result.session.roleCode) },
        });
      } catch {
        // ignore post-login side effects
      }
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      return msg || 'تعذر إكمال تسجيل الدخول. حاول مرة أخرى.';
    }
  }, []);

  const logout = useCallback(async () => {
    if (session) {
      await logActivity({
        actionType: 'LOGOUT',
        details: `تسجيل خروج (${session.fullName})`,
        pageUrl: typeof window !== 'undefined' ? window.location.pathname : '/me',
        module: 'auth',
        actor: {
          userId: session.userId,
          userName: session.fullName,
          userRole: session.roleCode,
        },
      });
    }
    await signOutAuth();
    setSession(null);
    setProfile(null);
  }, [session]);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    setProfile(await getUserProfile(session.userId));
  }, [session]);

  const permissions = session?.permissions ?? [];

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      permissions,
      canAccess: (department) => canAccessDepartment(permissions, department),
      canManageStaff: canManageUsers(permissions),
      has: (permission) => hasPermission(permissions, permission),
      loginWithEmail,
      sendPhoneCode,
      loginWithPhone,
      logout,
      refreshProfile,
    }),
    [session, profile, loading, permissions, loginWithEmail, sendPhoneCode, loginWithPhone, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
