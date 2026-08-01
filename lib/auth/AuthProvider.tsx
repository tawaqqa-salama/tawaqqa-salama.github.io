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
    const { session: next } = await restoreAuthSession();
    setSession(next);
    if (next) {
      const user = await getUserProfile(next.userId);
      setProfile(user);
    } else {
      setProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const result = await signInWithEmailPassword(email, password);
    if (result.error || !result.session) return result.error || 'فشل تسجيل الدخول';
    setSession(result.session);
    setProfile(await getUserProfile(result.session.userId));
    void logActivity({
      actionType: 'LOGIN',
      details: `تسجيل دخول ناجح (${result.session.fullName}) عبر البريد`,
      pageUrl: '/login',
      module: 'auth',
      actor: {
        userId: result.session.userId,
        userName: result.session.fullName,
        userRole: result.session.roleCode,
      },
      metadata: { method: 'email', role: roleLabel(result.session.roleCode) },
    });
    return null;
  }, []);

  const sendPhoneCode = useCallback(async (phone: string) => requestPhoneOtp(phone), []);

  const loginWithPhone = useCallback(async (phone: string, code: string) => {
    const result = await verifyPhoneOtp(phone, code);
    if (result.error || !result.session) return result.error || 'فشل تسجيل الدخول';
    setSession(result.session);
    setProfile(await getUserProfile(result.session.userId));
    void logActivity({
      actionType: 'LOGIN',
      details: `تسجيل دخول ناجح (${result.session.fullName}) عبر الجوال`,
      pageUrl: '/login',
      module: 'auth',
      actor: {
        userId: result.session.userId,
        userName: result.session.fullName,
        userRole: result.session.roleCode,
      },
      metadata: { method: 'phone', role: roleLabel(result.session.roleCode) },
    });
    return null;
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
