import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { testAuthCookie } from './helpers/auth-cookie';

const getUserMock = vi.fn();
const loadByAuthMock = vi.fn();
const createUserScopedMock = vi.fn();
const hasServiceRoleMock = vi.fn(() => false);
const maybeSingleMock = vi.fn();

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
      from: actual.supabase.from.bind(actual.supabase),
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

import { requireTenantFromRequest, TenantAccessError } from '@/lib/tenant/context';
import { getTenant, TenantLookupError } from '@/lib/tenant/service';

const AUTH_ID = 'auth-user-tenant';
const APP_USER_ID = 'usr-tenant-admin';
/** Production Tawaqqa company id — fixture only; tests never mutate Production. */
const COMPANY_ID = '3580b47a-a57b-4b3c-8f0d-db72870c8a85';
const OTHER_COMPANY = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: APP_USER_ID,
    email: 'admin@tawaqqa.sa',
    full_name: 'Admin',
    role_code: 'tenant_admin',
    company_id: COMPANY_ID,
    is_active: true,
    deleted_at: null,
    auth_user_id: AUTH_ID,
    ...overrides,
  };
}

function companyRow(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function makeRequest(opts?: {
  token?: string | null;
  cookieCompany?: string;
  cookieRole?: string;
}) {
  const headers: Record<string, string> = {
    cookie: testAuthCookie({
      userId: APP_USER_ID,
      roleCode: opts?.cookieRole || 'tenant_admin',
      companyId: opts?.cookieCompany || COMPANY_ID,
    }),
  };
  // testAuthCookie defaults TENANT_FORCE_MEMORY=true — force real getTenant path
  process.env.TENANT_FORCE_MEMORY = 'false';
  if (opts?.token !== null) {
    headers.Authorization = `Bearer ${opts?.token || 'valid.jwt'}`;
  }
  return new Request('http://localhost/api/design/knowledge/reingest', { headers });
}

describe('JWT tenant lookup (no service role)', () => {
  const prevMemory = process.env.TENANT_FORCE_MEMORY;

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.ALLOW_DEMO_MODE = 'true';
    process.env.TENANT_FORCE_MEMORY = 'false';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ezmdkwgziyencejfevso.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    hasServiceRoleMock.mockReturnValue(false);

    getUserMock.mockReset();
    loadByAuthMock.mockReset();
    createUserScopedMock.mockReset();
    maybeSingleMock.mockReset();

    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeUser());
    createUserScopedMock.mockReturnValue({
      from: vi.fn((table: string) => chainableFrom(table)),
      auth: { getUser: getUserMock },
    });
  });

  afterEach(() => {
    process.env.TENANT_FORCE_MEMORY = prevMemory ?? 'true';
  });

  it('active tenant readable via user-scoped JWT => allowed', async () => {
    maybeSingleMock.mockResolvedValue({ data: companyRow(), error: null });

    const ctx = await requireTenantFromRequest(makeRequest({ token: 'valid.jwt' }));
    expect(ctx.tenantId).toBe(COMPANY_ID);
    expect(ctx.tenant.is_active).toBe(true);
    expect(ctx.roleCode).toBe('tenant_admin');
    expect(createUserScopedMock).toHaveBeenCalledWith('valid.jwt');
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(hasServiceRoleMock()).toBe(false);
  });

  it('tenant query/RLS error => explicit lookup failure, not inactive', async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table companies', code: '42501' },
    });

    let err: unknown;
    try {
      await requireTenantFromRequest(makeRequest());
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TenantAccessError);
    expect((err as TenantAccessError).status).toBe(503);
    expect((err as TenantAccessError).message).toMatch(/Tenant lookup failed|permission denied/i);
    expect((err as TenantAccessError).message).not.toMatch(/inactive or suspended/i);
  });

  it('is_active=false => 403 Tenant inactive', async () => {
    maybeSingleMock.mockResolvedValue({
      data: companyRow({ is_active: false }),
      error: null,
    });

    await expect(requireTenantFromRequest(makeRequest())).rejects.toMatchObject({
      message: 'Tenant inactive',
      status: 403,
    });
  });

  it('status=suspended => 403 Tenant suspended', async () => {
    maybeSingleMock.mockResolvedValue({
      data: companyRow({ status: 'suspended' }),
      error: null,
    });

    await expect(requireTenantFromRequest(makeRequest())).rejects.toMatchObject({
      message: 'Tenant suspended',
      status: 403,
    });
  });

  it('cross-tenant companyIdFromRequest remains denied', async () => {
    maybeSingleMock.mockResolvedValue({ data: companyRow(), error: null });

    await expect(
      requireTenantFromRequest(makeRequest(), { companyIdFromRequest: OTHER_COMPANY })
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Cross-tenant/i),
    });
  });

  it('valid JWT path works without SUPABASE_SERVICE_ROLE_KEY', async () => {
    maybeSingleMock.mockResolvedValue({ data: companyRow(), error: null });
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();

    const ctx = await requireTenantFromRequest(makeRequest({ token: 'tok' }));
    expect(ctx.tenantId).toBe(COMPANY_ID);
    expect(createUserScopedMock).toHaveBeenCalledWith('tok');
  });

  it('getTenant requireClient refuses anon fallback', async () => {
    await expect(getTenant(COMPANY_ID, null, { requireClient: true })).rejects.toBeInstanceOf(
      TenantLookupError
    );
    await expect(getTenant(COMPANY_ID, null, { requireClient: true })).rejects.toMatchObject({
      reason: 'client_required',
      status: 503,
    });
  });

  it('empty RLS result (no error) is Tenant not found — not inactive', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(requireTenantFromRequest(makeRequest())).rejects.toMatchObject({
      message: 'Tenant not found',
      status: 404,
    });
  });

  it('createUserScopedSupabase uses accessToken option (source contract)', () => {
    const src = readFileSync(new URL('../lib/supabase/server.ts', import.meta.url), 'utf8');
    expect(src).toContain('accessToken: async () => token');
    expect(src).toContain('Authorization: `Bearer ${token}`');
  });

  it('context no longer collapses lookup failures into inactive-or-suspended', () => {
    const src = readFileSync(new URL('../lib/tenant/context.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('Tenant inactive or suspended');
    expect(src).toContain('TenantLookupError');
    expect(src).toContain('requireClient: Boolean(accessToken)');
    expect(src).toContain('Tenant inactive');
    expect(src).toContain('Tenant suspended');
    expect(src).toContain('Tenant not found');
  });
});
