import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { testAuthCookie } from './helpers/auth-cookie';

const getUserMock = vi.fn();
const loadByAuthMock = vi.fn();
const loadByIdMock = vi.fn();
const reingestMock = vi.fn();
const createUserScopedMock = vi.fn();
const hasServiceRoleMock = vi.fn(() => false);

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
    loadUserByIdTrusted: (...args: unknown[]) => loadByIdMock(...args),
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

vi.mock('@/lib/design-intelligence/knowledge-base', () => ({
  reingestKnowledgeDocumentFromStorage: (...args: unknown[]) => reingestMock(...args),
}));

import { POST } from '@/app/api/design/knowledge/reingest/route';
import { resolveLiveActor, ActorValidationError } from '@/lib/auth/session-actor';
import { encodeCookiePayload, type CookieSessionPayload } from '@/lib/auth/session-cookie';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_ID = 'auth-user-aaa';
const APP_USER_ID = 'usr-admin';
const COMPANY_A = 'co-tawaqqa';
const COMPANY_B = 'co-other';

function activeAdmin(overrides: Record<string, unknown> = {}) {
  return {
    id: APP_USER_ID,
    email: 'admin@tawaqqa.sa',
    full_name: 'Admin',
    role_code: 'tenant_admin',
    company_id: COMPANY_A,
    is_active: true,
    deleted_at: null,
    auth_user_id: AUTH_ID,
    ...overrides,
  };
}

function cookieHeader(overrides: Partial<CookieSessionPayload> = {}) {
  return testAuthCookie({
    userId: APP_USER_ID,
    roleCode: 'tenant_admin',
    companyId: COMPANY_A,
    ...overrides,
  });
}

function makeRequest(opts: {
  token?: string | null;
  cookie?: string;
  body?: Record<string, unknown>;
}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    cookie: opts.cookie ?? cookieHeader(),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  return new Request('http://localhost/api/design/knowledge/reingest', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body ?? { documentId: DOC_ID }),
  });
}

describe('reingest JWT live-actor (no service role)', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.ALLOW_DEMO_MODE = 'true';
    process.env.TENANT_FORCE_MEMORY = 'true';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ezmdkwgziyencejfevso.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    hasServiceRoleMock.mockReturnValue(false);

    getUserMock.mockReset();
    loadByAuthMock.mockReset();
    loadByIdMock.mockReset();
    reingestMock.mockReset();
    createUserScopedMock.mockReset();

    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      or: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: undefined as undefined,
    };
    createUserScopedMock.mockReturnValue({
      from: vi.fn(() => chain),
      storage: { from: vi.fn() },
      auth: { getUser: getUserMock },
    });
    reingestMock.mockResolvedValue({
      ok: true,
      doc: {
        id: DOC_ID,
        company_id: COMPANY_A,
        storage_path: 'path/doc.pdf',
        code: 'NFPA 13',
        edition: '2022',
        ingestion_version: 2,
        index_status: 'indexed',
        ingestion_status: 'ready',
        page_count: 10,
        platform_verification_status: 'verified',
        verification_status: 'verified',
      },
      chunks_before: 1,
      chunks_after: 5,
      page_count: 10,
    });
  });

  afterEach(() => {
    delete process.env.ALLOW_DEMO_MODE;
    delete process.env.TENANT_FORCE_MEMORY;
  });

  it('valid JWT + active linked admin => reaches reingest with session tenant', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeAdmin());

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.companyId).toBe(COMPANY_A);
    expect(reingestMock).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({ companyId: COMPANY_A })
    );
    expect(loadByAuthMock).toHaveBeenCalledWith(AUTH_ID, 'valid.jwt');
    expect(loadByIdMock).not.toHaveBeenCalled();
    expect(hasServiceRoleMock()).toBe(false);
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it('valid JWT + user row missing => 403', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/No employee profile|not found|linked/i);
    expect(reingestMock).not.toHaveBeenCalled();
  });

  it('valid JWT + is_active=false => 403', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeAdmin({ is_active: false }));

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/disabled/i);
    expect(reingestMock).not.toHaveBeenCalled();
  });

  it('valid JWT + deleted_at set => 403', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(
      activeAdmin({ deleted_at: '2026-01-01T00:00:00.000Z' })
    );

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/deleted|disabled/i);
    expect(reingestMock).not.toHaveBeenCalled();
  });

  it('auth_user_id mismatch => rejected', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeAdmin({ auth_user_id: 'auth-other' }));

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/auth_user_id mismatch/i);
    expect(reingestMock).not.toHaveBeenCalled();
  });

  it('missing bearer => 401', async () => {
    const res = await POST(makeRequest({ token: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Bearer/i);
    expect(reingestMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('invalid/expired JWT => 401', async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'jwt expired' },
    });

    const res = await POST(makeRequest({ token: 'expired.jwt' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid or expired/i);
    expect(reingestMock).not.toHaveBeenCalled();
  });

  it('forged cookie role/company cannot elevate access', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    // Live DB says sales on company A — cookie claims super_admin on company B
    loadByAuthMock.mockResolvedValue(
      activeAdmin({ role_code: 'sales', company_id: COMPANY_A })
    );

    const res = await POST(
      makeRequest({
        token: 'valid.jwt',
        cookie: cookieHeader({
          roleCode: 'super_admin',
          companyId: COMPANY_B,
          userId: APP_USER_ID,
        }),
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Insufficient role/i);
    expect(reingestMock).not.toHaveBeenCalled();
  });

  it('different company document cannot be reingested (tenant scoped)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeAdmin());
    reingestMock.mockResolvedValue({
      ok: false,
      error: 'company_mismatch',
      chunks_before: 0,
      chunks_after: 0,
    });

    const res = await POST(
      makeRequest({
        token: 'valid.jwt',
        body: { documentId: DOC_ID, company_id: COMPANY_B, companyId: COMPANY_B },
      })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('company_mismatch');
    expect(reingestMock).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({ companyId: COMPANY_A })
    );
  });

  it('no SUPABASE_SERVICE_ROLE_KEY required for valid JWT path', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeAdmin());
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(hasServiceRoleMock()).toBe(false);

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(200);
    expect(createUserScopedMock).toHaveBeenCalledWith('valid.jwt');
  });
});

describe('resolveLiveActor JWT preference', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ezmdkwgziyencejfevso.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    hasServiceRoleMock.mockReturnValue(false);
    getUserMock.mockReset();
    loadByAuthMock.mockReset();
    loadByIdMock.mockReset();
  });

  it('uses auth_user_id JWT path and ignores forged cookie role', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(
      activeAdmin({ role_code: 'engineer', company_id: COMPANY_A })
    );

    const session: CookieSessionPayload = {
      userId: APP_USER_ID,
      email: 'admin@tawaqqa.sa',
      fullName: 'Admin',
      roleCode: 'super_admin',
      companyId: COMPANY_B,
      loggedInAt: new Date().toISOString(),
      method: 'email',
    };

    const actor = await resolveLiveActor(session, { accessToken: 'tok' });
    expect(actor.roleCode).toBe('engineer');
    expect(actor.companyId).toBe(COMPANY_A);
    expect(loadByIdMock).not.toHaveBeenCalled();
  });

  it('production without service role rejects cookie-only actor lookup', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await expect(
        resolveLiveActor(
          {
            userId: APP_USER_ID,
            email: 'a@b.c',
            fullName: 'A',
            roleCode: 'admin',
            companyId: COMPANY_A,
            loggedInAt: new Date().toISOString(),
            method: 'email',
          },
          { accessToken: null }
        )
      ).rejects.toMatchObject({
        message: expect.stringMatching(/Bearer access token required/i),
        status: 401,
      } satisfies Partial<ActorValidationError>);
      expect(loadByIdMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ezmdkwgziyencejfevso.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    }
  });
});

describe('reingest UI + route source contracts', () => {
  it('UI sends Authorization Bearer from supabase.auth.getSession', () => {
    const panel = readFileSync(
      new URL('../components/design/CodeKnowledgePanel.tsx', import.meta.url),
      'utf8'
    );
    expect(panel).toContain('supabase.auth.getSession()');
    expect(panel).toContain('Authorization: `Bearer ${accessToken}`');
    expect(panel).toContain("fetch('/api/design/knowledge/reingest'");
  });

  it('route uses getBearerAccessToken before withTenantApi and never needs service role', () => {
    const route = readFileSync(
      new URL('../app/api/design/knowledge/reingest/route.ts', import.meta.url),
      'utf8'
    );
    expect(route).toContain('getBearerAccessToken(req)');
    expect(route.indexOf('getBearerAccessToken')).toBeLessThan(route.indexOf('withTenantApi'));
    expect(route).not.toMatch(/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    expect(route).not.toContain('createServiceRoleSupabase');
    expect(route).toContain("withTenantApi(req, { module: 'design' })");
  });

  it('session-actor prefers loadUserByAuthUserIdTrusted when token present', () => {
    const src = readFileSync(
      new URL('../lib/auth/session-actor.ts', import.meta.url),
      'utf8'
    );
    expect(src).toContain('loadUserByAuthUserIdTrusted');
    expect(src).toContain('supabase.auth.getUser(token)');
    expect(src).toContain('Bearer access token required for live identity validation');
    expect(src).not.toContain('loadUserByEmailTrusted');
  });
});

// Silence unused import warning in some TS configs
void encodeCookiePayload;
