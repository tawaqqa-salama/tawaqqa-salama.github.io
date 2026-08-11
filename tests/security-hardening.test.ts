import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_COOKIE_NAME,
  decodeCookiePayload,
  encodeCookiePayload,
  encodeTamperedCookiePayload,
  encodeUnsignedLegacyPayload,
  sessionToCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';
import { mintTrustedSession } from '@/lib/auth/mint-session';
import { requireApiSession } from '@/lib/api/require-session';
import {
  assertTenantRow,
  TenantAccessError,
  getSessionFromRequest,
  requireTenantFromRequest,
} from '@/lib/tenant/context';
import { tenantMemory } from '@/lib/tenant/memory';
import { POST as sessionPost } from '@/app/api/auth/session/route';
import { GET as funnelGet } from '@/app/api/integrations/marketing/funnel/route';
import { GET as tenantsGet } from '@/app/api/platform/tenants/route';
import { POST as sendPost } from '@/app/api/integrations/whatsapp/send/route';
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

function basePayload(overrides: Partial<CookieSessionPayload> = {}): CookieSessionPayload {
  return {
    userId: 'usr-a',
    email: 'a@company-a.test',
    fullName: 'User A',
    roleCode: 'sales',
    companyId: 'co-tawaqqa',
    loggedInAt: new Date().toISOString(),
    method: 'email',
    ...overrides,
  };
}

function signedCookie(overrides: Partial<CookieSessionPayload> = {}) {
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(encodeCookiePayload(basePayload(overrides)))}`;
}

describe('Security — signed session cookie', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.ALLOW_DEMO_MODE = 'true';
    process.env.TENANT_FORCE_MEMORY = 'true';
  });

  afterEach(() => {
    delete process.env.AUTH_SESSION_SECRET;
  });

  it('rejects forged unsigned legacy cookies', () => {
    const forged = encodeUnsignedLegacyPayload(
      basePayload({ roleCode: 'super_admin', companyId: 'co-other' })
    );
    expect(decodeCookiePayload(forged)).toBeNull();
    const gate = requireApiSession(
      new Request('http://localhost/api/x', { headers: { cookie: `${AUTH_COOKIE_NAME}=${forged}` } })
    );
    expect(gate.ok).toBe(false);
  });

  it('rejects invalid session signature', () => {
    const tampered = encodeTamperedCookiePayload(basePayload({ roleCode: 'super_admin' }));
    expect(decodeCookiePayload(tampered)).toBeNull();
  });

  it('rejects expired session', () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = encodeCookiePayload({
      ...basePayload(),
      iat: now - 10_000,
      exp: now - 60,
    });
    expect(decodeCookiePayload(expired)).toBeNull();
  });

  it('accepts valid signed cookie round-trip', () => {
    const payload = sessionToCookiePayload({
      userId: 'u1',
      email: 'a@b.c',
      fullName: 'Admin',
      username: 'admin',
      roleCode: 'admin',
      permissions: ['*'],
      loggedInAt: '2026-08-04T00:00:00.000Z',
      method: 'email',
      companyId: 'co-tawaqqa',
    });
    const encoded = encodeCookiePayload(payload);
    const decoded = decodeCookiePayload(encoded);
    expect(decoded?.userId).toBe('u1');
    expect(decoded?.roleCode).toBe('admin');
    expect(encoded).toContain('.');
  });

  it('middleware blocks API when cookie is forged', async () => {
    const forged = encodeUnsignedLegacyPayload(basePayload({ roleCode: 'super_admin' }));
    const req = new NextRequest('http://localhost/api/integrations/whatsapp/send', {
      headers: { cookie: `${AUTH_COOKIE_NAME}=${forged}` },
    });
    const res = middleware(req);
    expect(res.status).toBe(401);
  });
});

describe('Security — role / company cannot be escalated from browser', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.ALLOW_DEMO_MODE = 'true';
    process.env.TENANT_FORCE_MEMORY = 'true';
    tenantMemory.reset();
  });

  it('POST /api/auth/session ignores client roleCode escalation', async () => {
    // Demo memory has seeded admin user — attempt to mint as sales with forged super_admin
    const res = await sessionPost(
      new Request('http://localhost/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'usr-sales',
          email: 'sales@tawaqqa.sa',
          fullName: 'Sales',
          roleCode: 'super_admin',
          companyId: 'co-evil',
          method: 'email',
          loggedInAt: new Date().toISOString(),
        }),
      })
    );

    // Either rejects unknown user or mints with DB role — never trusts body role
    if (res.status === 200) {
      const setCookie = res.headers.get('set-cookie') || '';
      const match = setCookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
      const raw = match?.[1] ? decodeURIComponent(match[1]) : null;
      const session = decodeCookiePayload(raw);
      expect(session).not.toBeNull();
      expect(session?.roleCode).not.toBe('super_admin');
      expect(session?.companyId).not.toBe('co-evil');
    } else {
      expect([401, 403]).toContain(res.status);
    }
  });

  it('mintTrustedSession never copies role/company from request body', async () => {
    const result = await mintTrustedSession({
      userId: 'nonexistent-user-xyz',
      email: 'nobody@example.com',
      roleCode: 'super_admin',
      companyId: 'co-hijack',
    });
    expect(result.ok).toBe(false);
  });

  it('sales cookie cannot access platform tenants API (no role escalation via cookie forge)', async () => {
    const denied = await tenantsGet(
      new Request('http://localhost/api/platform/tenants', {
        headers: { cookie: signedCookie({ roleCode: 'sales', userId: 'usr-sales' }) },
      })
    );
    expect(denied.status).toBe(403);
  });

  it('unsigned super_admin cookie is rejected by platform API', async () => {
    const forged = encodeUnsignedLegacyPayload(
      basePayload({ roleCode: 'super_admin', userId: 'usr-admin' })
    );
    const denied = await tenantsGet(
      new Request('http://localhost/api/platform/tenants', {
        headers: { cookie: `${AUTH_COOKIE_NAME}=${forged}` },
      })
    );
    // Unsigned cookie → unauthenticated (401); never treated as platform admin
    expect([401, 403]).toContain(denied.status);
  });
});

describe('Security — cross-tenant isolation helpers', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.TENANT_FORCE_MEMORY = 'true';
    tenantMemory.reset();
  });

  it('blocks cross-tenant SELECT/UPDATE/DELETE via assertTenantRow', () => {
    const ctx = {
      session: basePayload({ companyId: 'co-tawaqqa', roleCode: 'sales' }),
      tenantId: 'co-tawaqqa',
      tenant: tenantMemory.getTenant('co-tawaqqa')!,
      roleCode: 'sales',
      isPlatformAdmin: false,
      supportMode: false,
    };

    // SELECT / UPDATE / DELETE all share the same ownership check
    expect(() => assertTenantRow(ctx, 'co-idn-pilot', 'client')).toThrow(TenantAccessError);
    expect(() => assertTenantRow(ctx, 'co-tawaqqa', 'client')).not.toThrow();
    expect(() => assertTenantRow(ctx, null, 'client')).toThrow(TenantAccessError);
  });

  it('requireTenantFromRequest rejects cross-tenant companyIdFromRequest', async () => {
    const req = new Request('http://localhost/api/x', {
      headers: { cookie: signedCookie({ roleCode: 'sales', companyId: 'co-tawaqqa' }) },
    });
    await expect(
      requireTenantFromRequest(req, { companyIdFromRequest: 'co-idn-pilot' })
    ).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('unauthorized API request without cookie returns 401', async () => {
    const res = await funnelGet(new Request('http://localhost/api/integrations/marketing/funnel'));
    expect(res.status).toBe(401);
  });

  it('unauthorized WhatsApp send without cookie returns 401', async () => {
    const res = await sendPost(
      new Request('http://localhost/api/integrations/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: 'c1', text: 'hi' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('getSessionFromRequest rejects tampered cookies', () => {
    const tampered = encodeTamperedCookiePayload(basePayload({ roleCode: 'super_admin' }));
    const session = getSessionFromRequest(
      new Request('http://localhost/api/x', {
        headers: { cookie: `${AUTH_COOKIE_NAME}=${tampered}` },
      })
    );
    expect(session).toBeNull();
  });
});

describe('Security — storage path authorization model', () => {
  it('documents that path prefixes alone are not authorization (policy uses clients.company_id)', () => {
    // Contract test: storage object keys are `{clientId}/...` and RLS must join clients.
    // See scripts/sql/041_production_security_hardening.sql project_files_tenant_* policies.
    const samplePath = 'client-uuid-aaa/plans/file.pdf';
    const firstSegment = samplePath.split('/')[0];
    expect(firstSegment).toBe('client-uuid-aaa');
    expect(firstSegment).not.toBe('co-tawaqqa');
  });
});
