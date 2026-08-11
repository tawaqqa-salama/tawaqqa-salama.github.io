import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AUTH_COOKIE_NAME,
  encodeCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';
import {
  canManageUsersRole,
  canReadFinanceRole,
  canWriteFinanceRole,
} from '@/lib/auth/rls-roles';
import { assertTenantRow, TenantAccessError, requireTenantFromRequest } from '@/lib/tenant/context';
import { tenantMemory } from '@/lib/tenant/memory';

const getUserMock = vi.fn();

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
    loadUserByAuthUserIdTrusted: vi.fn(),
    loadUserByIdTrusted: vi.fn(),
    loadUserByEmailTrusted: vi.fn(),
  };
});

import { mintTrustedSession } from '@/lib/auth/mint-session';
import {
  isUserRowUsable,
  loadUserByAuthUserIdTrusted,
  loadUserByIdTrusted,
} from '@/lib/auth/trusted-user';

const loadByAuth = loadUserByAuthUserIdTrusted as unknown as ReturnType<typeof vi.fn>;
const loadById = loadUserByIdTrusted as unknown as ReturnType<typeof vi.fn>;

function cookie(overrides: Partial<CookieSessionPayload> = {}) {
  process.env.AUTH_SESSION_SECRET =
    process.env.AUTH_SESSION_SECRET || 'test-auth-session-secret-32chars!!';
  const payload: CookieSessionPayload = {
    userId: 'usr-sales',
    email: 'sales@tawaqqa.sa',
    fullName: 'Sales',
    roleCode: 'sales',
    companyId: 'co-tawaqqa',
    loggedInAt: new Date().toISOString(),
    method: 'email',
    ...overrides,
  };
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(encodeCookiePayload(payload))}`;
}

describe('P0 — Supabase Auth session minting', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.ALLOW_DEMO_MODE = 'false';
    getUserMock.mockReset();
    loadByAuth.mockReset();
    loadById.mockReset();
  });

  afterEach(() => {
    delete process.env.ALLOW_DEMO_MODE;
  });

  it('1) valid JWT + matching auth_user_id → session mint succeeds', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'auth-aaa', email: 'a@co.test' } },
      error: null,
    });
    loadByAuth.mockResolvedValue({
      id: 'usr-a',
      email: 'a@co.test',
      full_name: 'A',
      role_code: 'sales',
      company_id: 'co-a',
      is_active: true,
      deleted_at: null,
      auth_user_id: 'auth-aaa',
    });

    const result = await mintTrustedSession({
      accessToken: 'valid.jwt.token',
      roleCode: 'super_admin',
      companyId: 'co-evil',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.roleCode).toBe('sales');
    expect(result.payload.companyId).toBe('co-a');
    expect(result.cookieValue).toContain('.');
  });

  it('2) invalid JWT → 401', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid' },
    });
    const result = await mintTrustedSession({ accessToken: 'bad' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
  });

  it('3) valid JWT but no matching users.auth_user_id → 403', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'auth-orphan', email: 'x@y.z' } },
      error: null,
    });
    loadByAuth.mockResolvedValue(null);
    const result = await mintTrustedSession({ accessToken: 'valid.jwt' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  it('rejects auth_user_id mismatch even if a row is returned', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'auth-aaa' } },
      error: null,
    });
    loadByAuth.mockResolvedValue({
      id: 'usr-a',
      email: 'a@co.test',
      full_name: 'A',
      role_code: 'sales',
      company_id: 'co-a',
      is_active: true,
      auth_user_id: 'auth-OTHER',
    });
    const result = await mintTrustedSession({ accessToken: 'valid.jwt' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });
});

describe('P0 — live actor revalidation', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.TENANT_FORCE_MEMORY = 'true';
    process.env.ALLOW_DEMO_MODE = 'true';
    tenantMemory.reset();
    loadById.mockReset();
  });

  it('4) disabled user → 403 even with valid old cookie', async () => {
    loadById.mockResolvedValue({
      id: 'usr-sales',
      email: 'sales@tawaqqa.sa',
      full_name: 'Sales',
      role_code: 'sales',
      company_id: 'co-tawaqqa',
      is_active: false,
      deleted_at: null,
    });

    await expect(
      requireTenantFromRequest(
        new Request('http://localhost/api/x', { headers: { cookie: cookie() } })
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it('4b) deleted_at set → 403', async () => {
    loadById.mockResolvedValue({
      id: 'usr-sales',
      email: 'sales@tawaqqa.sa',
      full_name: 'Sales',
      role_code: 'sales',
      company_id: 'co-tawaqqa',
      is_active: true,
      deleted_at: new Date().toISOString(),
    });
    await expect(
      requireTenantFromRequest(
        new Request('http://localhost/api/x', { headers: { cookie: cookie() } })
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  it('5) changed role → authorization uses current DB role', async () => {
    loadById.mockResolvedValue({
      id: 'usr-sales',
      email: 'sales@tawaqqa.sa',
      full_name: 'Sales',
      role_code: 'accountant',
      company_id: 'co-tawaqqa',
      is_active: true,
      deleted_at: null,
      is_platform_admin: false,
    });

    const ctx = await requireTenantFromRequest(
      new Request('http://localhost/api/x', {
        headers: { cookie: cookie({ roleCode: 'sales' }) },
      })
    );
    expect(ctx.roleCode).toBe('accountant');
    expect(ctx.session.roleCode).toBe('accountant');
    expect(canWriteFinanceRole(ctx.roleCode)).toBe(true);
    expect(canWriteFinanceRole('sales')).toBe(false);
  });
});

describe('P0 — cross-tenant + role-level gates', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.TENANT_FORCE_MEMORY = 'true';
    tenantMemory.reset();
    loadById.mockReset();
    loadById.mockResolvedValue({
      id: 'usr-a',
      email: 'a@co-a.test',
      full_name: 'User A',
      role_code: 'staff',
      company_id: 'co-tawaqqa',
      is_active: true,
      deleted_at: null,
    });
  });

  it('6) Company A cannot read Company B (assertTenantRow SELECT)', async () => {
    const ctx = await requireTenantFromRequest(
      new Request('http://localhost/api/x', {
        headers: { cookie: cookie({ userId: 'usr-a', companyId: 'co-tawaqqa', roleCode: 'staff' }) },
      })
    );
    expect(() => assertTenantRow(ctx, 'co-idn-pilot', 'client')).toThrow(TenantAccessError);
    expect(() => assertTenantRow(ctx, 'co-tawaqqa', 'client')).not.toThrow();
  });

  it('7) Company A cannot update Company B', async () => {
    const ctx = await requireTenantFromRequest(
      new Request('http://localhost/api/x', {
        headers: { cookie: cookie({ userId: 'usr-a', companyId: 'co-tawaqqa', roleCode: 'staff' }) },
      })
    );
    // Same ownership primitive gates UPDATE/DELETE paths
    expect(() => assertTenantRow(ctx, 'co-idn-pilot', 'invoice')).toThrow(TenantAccessError);
  });

  it('8) Staff cannot write financial/admin resources by role', () => {
    expect(canWriteFinanceRole('staff')).toBe(false);
    expect(canWriteFinanceRole('sales')).toBe(false);
    expect(canWriteFinanceRole('engineer')).toBe(false);
    expect(canReadFinanceRole('staff')).toBe(false);
    expect(canManageUsersRole('staff')).toBe(false);
    expect(canWriteFinanceRole('accountant')).toBe(true);
    expect(canManageUsersRole('admin')).toBe(true);

    const sql = readFileSync(
      resolve(__dirname, '../scripts/sql/042_role_level_rls.sql'),
      'utf8'
    );
    expect(sql).toContain('app_can_write_finance');
    expect(sql).toContain('app_can_manage_users');
    expect(sql).toContain('_finance_update');
    expect(sql).toContain('users_update_admin');
    expect(sql).toContain('tenant_modules_write');
    expect(sql).toContain('saas_audit_logs_select');
  });

  it('isUserRowUsable rejects inactive / deleted', () => {
    expect(
      isUserRowUsable({
        id: '1',
        email: 'a@b.c',
        full_name: 'A',
        role_code: 'staff',
        company_id: 'c',
        is_active: false,
      })
    ).toBe(false);
    expect(
      isUserRowUsable({
        id: '1',
        email: 'a@b.c',
        full_name: 'A',
        role_code: 'staff',
        company_id: 'c',
        is_active: true,
        deleted_at: '2026-01-01',
      })
    ).toBe(false);
  });
});
