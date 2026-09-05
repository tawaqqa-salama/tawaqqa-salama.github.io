/**
 * POST /api/design/rag — Bearer JWT + user-scoped Supabase (RLS).
 * Mirrors reingest / tenant-context Production auth; never uses service_role.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { testAuthCookie } from './helpers/auth-cookie';

const getUserMock = vi.fn();
const loadByAuthMock = vi.fn();
const loadByIdMock = vi.fn();
const ragQueryMock = vi.fn();
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
  ragQuery: (...args: unknown[]) => ragQueryMock(...args),
}));

import { POST } from '@/app/api/design/rag/route';

const AUTH_ID = 'auth-user-rag';
const APP_USER_ID = 'usr-rag-admin';
const COMPANY_A = 'co-tawaqqa';
const COMPANY_B = 'co-other';

function activeEngineer(overrides: Record<string, unknown> = {}) {
  return {
    id: APP_USER_ID,
    email: 'engineer@tawaqqa.sa',
    full_name: 'Engineer',
    role_code: 'engineer',
    company_id: COMPANY_A,
    is_active: true,
    deleted_at: null,
    auth_user_id: AUTH_ID,
    ...overrides,
  };
}

function cookieHeader(overrides: Record<string, unknown> = {}) {
  return testAuthCookie({
    userId: APP_USER_ID,
    roleCode: 'engineer',
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
  return new Request('http://localhost/api/design/rag', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body ?? { question: 'What does NFPA 13 require?', topK: 5 }),
  });
}

describe('design RAG Bearer + RLS auth boundary', () => {
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
    ragQueryMock.mockReset();
    createUserScopedMock.mockReset();

    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      or: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    createUserScopedMock.mockReturnValue({
      from: vi.fn(() => chain),
      auth: { getUser: getUserMock },
    });

    ragQueryMock.mockResolvedValue({
      answer: 'Indexed NFPA guidance…',
      citations: [{ documentId: 'doc-1', excerpt: '…', score: 0.9 }],
      confidence: 0.9,
      reliable: true,
    });
  });

  afterEach(() => {
    delete process.env.ALLOW_DEMO_MODE;
    delete process.env.TENANT_FORCE_MEMORY;
  });

  it('missing Bearer => 401 (Production Supabase path)', async () => {
    const res = await POST(makeRequest({ token: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe('missing_bearer');
    expect(String(body.error)).toMatch(/Bearer/i);
    expect(ragQueryMock).not.toHaveBeenCalled();
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
    expect(body.ok).toBe(false);
    expect(ragQueryMock).not.toHaveBeenCalled();
  });

  it('inactive actor => 403', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeEngineer({ is_active: false }));

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(403);
    expect(ragQueryMock).not.toHaveBeenCalled();
  });

  it('deleted actor => 403', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(
      activeEngineer({ deleted_at: '2026-01-01T00:00:00.000Z' })
    );

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(403);
    expect(ragQueryMock).not.toHaveBeenCalled();
  });

  it('missing linked profile => 403', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(null);

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(403);
    expect(ragQueryMock).not.toHaveBeenCalled();
  });

  it('valid tenant user queries with session tenant + user-scoped client', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeEngineer());

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reliable).toBe(true);
    expect(createUserScopedMock).toHaveBeenCalledWith('valid.jwt');
    expect(ragQueryMock).toHaveBeenCalledWith(
      'What does NFPA 13 require?',
      5,
      expect.objectContaining({
        companyId: COMPANY_A,
        client: expect.anything(),
      })
    );
    expect(hasServiceRoleMock()).toBe(false);
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it('client company_id cannot switch tenant', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeEngineer());

    const res = await POST(
      makeRequest({
        token: 'valid.jwt',
        body: {
          question: 'sprinkler spacing',
          company_id: COMPANY_B,
          companyId: COMPANY_B,
        },
      })
    );
    expect(res.status).toBe(200);
    expect(ragQueryMock).toHaveBeenCalledWith(
      'sprinkler spacing',
      5,
      expect.objectContaining({ companyId: COMPANY_A })
    );
    const call = ragQueryMock.mock.calls[0][2] as { companyId: string };
    expect(call.companyId).not.toBe(COMPANY_B);
  });

  it('forged cookie company cannot override live actor tenant', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeEngineer({ company_id: COMPANY_A }));

    const res = await POST(
      makeRequest({
        token: 'valid.jwt',
        cookie: cookieHeader({ companyId: COMPANY_B, roleCode: 'super_admin' }),
      })
    );
    expect(res.status).toBe(200);
    expect(ragQueryMock).toHaveBeenCalledWith(
      expect.any(String),
      5,
      expect.objectContaining({ companyId: COMPANY_A })
    );
  });

  it('surfaces RagQueryError codes (RLS / search) without generic collapse', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: null });
    loadByAuthMock.mockResolvedValue(activeEngineer());
    const { RagQueryError } = await import('@/lib/design-intelligence/rag-log');
    ragQueryMock.mockRejectedValue(
      new RagQueryError('chunks_query_failed: permission denied', 'chunks_rls_denied', 403)
    );

    const res = await POST(makeRequest({ token: 'valid.jwt' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe('chunks_rls_denied');
    expect(body.stage).toBe('SEARCH');
    expect(String(body.error)).toMatch(/chunks_query_failed/i);
  });

  it('UI sends Authorization Bearer via withBrowserAuthHeaders', () => {
    const moduleSource = readFileSync(
      new URL('../components/design/DesignIntelligenceModule.tsx', import.meta.url),
      'utf8'
    );
    expect(moduleSource).toContain("from '@/lib/auth/browser-access-token'");
    expect(moduleSource).toContain('withBrowserAuthHeaders');
    expect(moduleSource).toContain("fetch('/api/design/rag'");
    expect(moduleSource).toMatch(/const headers = await withBrowserAuthHeaders/);
  });

  it('route requires Bearer + createUserScopedSupabase; no service_role', () => {
    const route = readFileSync(
      new URL('../app/api/design/rag/route.ts', import.meta.url),
      'utf8'
    );
    expect(route).toContain('getBearerAccessToken(req)');
    expect(route.indexOf('getBearerAccessToken')).toBeLessThan(route.indexOf('withTenantApi'));
    expect(route).toContain('createUserScopedSupabase(accessToken)');
    expect(route).toContain('client: userClient');
    expect(route).not.toMatch(/createServiceRoleSupabase|SUPABASE_SERVICE_ROLE/);
    expect(route).toContain('missing_bearer');
  });

  it('ragQuery accepts user-scoped client and fails closed on chunk RLS errors', () => {
    const kb = readFileSync(
      new URL('../lib/design-intelligence/knowledge-base.ts', import.meta.url),
      'utf8'
    );
    expect(kb).toContain('opts?.client || supabase');
    expect(kb).toContain('chunks_rls_denied');
    expect(kb).toContain('documents_rls_denied');
    expect(kb).not.toMatch(/createServiceRoleSupabase/);
  });
});

describe('design RAG cross-tenant isolation (ragQuery filter)', () => {
  it('filters local chunks to authenticated company only', async () => {
    const kb = readFileSync(
      new URL('../lib/design-intelligence/knowledge-base.ts', import.meta.url),
      'utf8'
    );
    expect(kb).toContain("query = query.eq('company_id', opts.companyId)");
    expect(kb).toContain('Fail closed without tenant');
    expect(kb).toContain('!c.company_id || c.company_id === opts.companyId');
  });
});
