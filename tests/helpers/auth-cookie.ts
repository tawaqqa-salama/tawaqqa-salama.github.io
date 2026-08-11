import {
  AUTH_COOKIE_NAME,
  encodeCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';

/** Signed session cookie header for API route tests. */
export function testAuthCookie(overrides: Partial<CookieSessionPayload> = {}): string {
  process.env.AUTH_SESSION_SECRET =
    process.env.AUTH_SESSION_SECRET || 'test-auth-session-secret-32chars!!';
  process.env.ALLOW_DEMO_MODE = process.env.ALLOW_DEMO_MODE || 'true';
  process.env.TENANT_FORCE_MEMORY = process.env.TENANT_FORCE_MEMORY || 'true';
  const payload: CookieSessionPayload = {
    userId: 'usr-admin',
    email: 'admin@tawaqqa.sa',
    fullName: 'Admin',
    roleCode: 'admin',
    companyId: 'co-tawaqqa',
    loggedInAt: new Date().toISOString(),
    method: 'email',
    ...overrides,
  };
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(encodeCookiePayload(payload))}`;
}
