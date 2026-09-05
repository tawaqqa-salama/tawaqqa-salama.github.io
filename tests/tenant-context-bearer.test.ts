/**
 * GET /api/tenant/context — Bearer JWT required on Production Supabase paths.
 * Cookie-only anonymous company lookups must not be used (RLS permission failures).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { testAuthCookie } from './helpers/auth-cookie';

const getUserMock = vi.fn();
const loadByAuthMock = vi.fn();
const createUserScopedMock = vi.fn();
const hasServiceRoleMock = vi.fn(() => false);
const maybeSingleMock = vi.fn();
const getTenantModulesMock = vi.fn();
const getUserMembershipsMock = vi.fn();

function chainableFrom(_table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.or = vi.fn(self);
  chain.is = vi.fn(self);
  chain.limit = vi.fn(self);
  chain.maybeSingle = (...args: unknown[]) => maybeSingleMock(...args);
  return chain;
}

vi.mock('@/lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase')>('@/lib/supabase');
  return {
    ...actual,
    isSupabaseConfigured: true,
    isDemoMode: false,
    supabase: {
      auth: {
        getUser: (...args: unknown[]) => getUserMock(...args),
      },
      from: (...args: unknown[]) => chainableFrom(String(args[0] || '')),
    },
  };
});

vi.mock('@/lib/auth/trusted-user', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/trusted-user')>(
    '@/lib/auth/trusted-user'
  );
  return {
    ...actual,
    loadUserByAuthUserIdTrusted: (...args: unknown[]) => loadByAuthMock(...args),
    loadUserByIdTrusted: vi.fn(),
  };
});

vi.mock('@/lib/supabase/server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/server')>(
    '@/lib/supabase/server'
  );
  return {
    ...actual,
    hasServiceRoleKey: () => hasServiceRoleMock(),
    createUserScopedSupabase: (...args: unknown[]) => createUserScopedMock(...args),
    createServiceRoleSupabase: () => null,
  };
});

vi.mock('@/lib/tenant/mode', () => ({
  isTenantMemoryMode: () => false,
}));

vi.mock('@/lib/tenant/service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenant/service')>(
    '@/lib/tenant/service'
  );
  return {
    ...actual,
    getTenantModules: (...args: unknown[]) => getTenantModulesMock(...args),
    getUserMemberships: (...args: unknown[]) => getUserMembershipsMock(...args),
  };
});

import { GET } from '@/app/api/tenant/context/route';

const AUTH_ID = 'auth-user-tenant-ctx';
const APP_USER_ID = 'usr-tenant-admin';
/** Fixture only — tests never mutate Production. */
const COMPANY_ID = '3580b47a-a57b-4b3c-8f0d-db72870c8a85';

function activeUser() {
  return {
    id: APP_USER_ID,
    email: 'admin@tawaqqa.sa',
    full_name: 'Admin',
    role_code: 'tenant_admin',
    company_id: COMPANY_ID,
    is_active: true,
    deleted_at: null,
    auth_user_id: AUTH_ID,
  };
}

function companyRow() {
  return {
    id: COMPANY_ID,
    code: 'TWAQQA',
    slug: 'tawaqqa',
    name: 'توقع سلامة',
    status: 'active',
    is_active: true,
    deleted_at: null,
    max_users: 200,
    max_projects: 5000,
    max_storage_mb: 102400,
    max_documents: 100000,
    subscription_status: 'active',
  };
}

describe('GET /api/tenant/context Bearer + RLS', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    loadByAuthMock.mockReset();
    createUserScopedMock.mockReset();
    maybeSingleMock.mockReset();
    getTenantModulesMock.mockReset();
    getUserMembershipsMock.mockReset();
    hasServiceRoleMock.mockReturnValue(false);
    createUserScopedMock.mockReturnValue({
      from: (table: string) => chainableFrom(table),
    });
    getTenantModulesMock.mockResolvedValue(['design']);
    getUserMembershipsMock.mockResolvedValue([
      { company_id: COMPANY_ID, is_default: true, role_code: 'tenant_admin' },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects Production requests without Bearer (no anonymous tenant lookup)', async () => {
    const cookie = testAuthCookie({
      userId: APP_USER_ID,
      email: 'admin@tawaqqa.sa',
      fullName: 'Admin',
      roleCode: 'tenant_admin',
      companyId: COMPANY_ID,
    });
    const res = await GET(
      new Request('http://localhost/api/tenant/context', {
        headers: { cookie },
      })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(String(body.error)).toMatch(/Bearer access token required for tenant context/i);
    expect(createUserScopedMock).not.toHaveBeenCalled();
  });

  it('succeeds with valid Bearer JWT + user-scoped client (never anon)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: AUTH_ID } },
      error: null,
    });
    loadByAuthMock.mockResolvedValue(activeUser());
    maybeSingleMock.mockResolvedValue({ data: companyRow(), error: null });

    const cookie = testAuthCookie({
      userId: APP_USER_ID,
      email: 'admin@tawaqqa.sa',
      fullName: 'Admin',
      roleCode: 'tenant_admin',
      companyId: COMPANY_ID,
    });
    const res = await GET(
      new Request('http://localhost/api/tenant/context', {
        headers: {
          cookie,
          Authorization: 'Bearer valid.jwt.token',
        },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tenant?.id).toBe(COMPANY_ID);
    expect(body.modules).toEqual(['design']);
    expect(createUserScopedMock).toHaveBeenCalledWith('valid.jwt.token');
    expect(getTenantModulesMock).toHaveBeenCalled();
    expect(getTenantModulesMock.mock.calls[0]?.[1]).toBeTruthy();
  });

  it('maps tenant RLS/permission denial to explicit JSON error (not opaque 500)', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: AUTH_ID } },
      error: null,
    });
    loadByAuthMock.mockResolvedValue(activeUser());
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table companies' },
    });

    const cookie = testAuthCookie({
      userId: APP_USER_ID,
      email: 'admin@tawaqqa.sa',
      fullName: 'Admin',
      roleCode: 'tenant_admin',
      companyId: COMPANY_ID,
    });
    const res = await GET(
      new Request('http://localhost/api/tenant/context', {
        headers: {
          cookie,
          Authorization: 'Bearer valid.jwt.token',
        },
      })
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(String(body.error)).toMatch(/Tenant lookup failed|permission/i);
  });

  it('AppShell and TenantSwitcher send Authorization Bearer to /api/tenant/context', () => {
    const shell = readFileSync(
      new URL('../components/layout/AppShell.tsx', import.meta.url),
      'utf8'
    );
    const switcher = readFileSync(
      new URL('../components/tenant/TenantSwitcher.tsx', import.meta.url),
      'utf8'
    );
    expect(shell).toMatch(/withBrowserAuthHeaders/);
    expect(shell).toMatch(/\/api\/tenant\/context/);
    expect(switcher).toMatch(/withBrowserAuthHeaders/);
    expect(switcher).toMatch(/\/api\/tenant\/context/);
  });
});
