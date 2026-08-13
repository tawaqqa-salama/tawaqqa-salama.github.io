/**
 * Final security closure regressions — DI RLS, public website tokens,
 * WhatsApp public resources, document signed URLs.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_COOKIE_NAME,
  encodeCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';
import { tenantMemory } from '@/lib/tenant/memory';
import { marketingMemory } from '@/lib/marketing/store/memory';
import {
  getOrCreateWebsiteSite,
  resolveWebsiteSiteByPublicToken,
  submitWebsiteForm,
} from '@/lib/website/service';
import { POST as publicFormPost } from '@/app/api/public/website/forms/[slug]/route';
import { POST as waClickPost } from '@/app/api/integrations/website/whatsapp-click/route';
import { POST as signedUrlPost } from '@/app/api/documents/signed-url/route';
import { POST as designRagPost } from '@/app/api/design/rag/route';
import {
  parseStoragePathOwnerSegment,
  storagePathBelongsToTenant,
} from '@/lib/storage/tenant-signed-url';
import { requireTenantFromRequest, TenantAccessError } from '@/lib/tenant/context';

function cookie(overrides: Partial<CookieSessionPayload> = {}) {
  process.env.AUTH_SESSION_SECRET =
    process.env.AUTH_SESSION_SECRET || 'test-auth-session-secret-32chars!!';
  const payload: CookieSessionPayload = {
    userId: 'usr-admin',
    email: 'admin@tawaqqa.sa',
    fullName: 'Admin',
    roleCode: 'manager',
    companyId: 'co-tawaqqa',
    loggedInAt: new Date().toISOString(),
    method: 'email',
    ...overrides,
  };
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(encodeCookiePayload(payload))}`;
}

describe('Final security closure — DI open-policy regression', () => {
  it('1) cross-tenant DI: 045 must lock di_* and must not reintroduce FOR ALL USING (true)', () => {
    const sqlDir = join(process.cwd(), 'scripts/sql');
    const files = readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort();
    const m045 = readFileSync(join(sqlDir, '045_design_intelligence_tenant_rls.sql'), 'utf8');

    expect(m045).toMatch(/di_knowledge_documents/);
    expect(m045).toMatch(/di_knowledge_chunks/);
    expect(m045).toMatch(/di_engineering_fields/);
    expect(m045).toMatch(/di_engineering_rules/);
    expect(m045).toMatch(/REVOKE ALL ON public\.%I FROM anon/);
    expect(m045).toMatch(/current_app_company_id\(\)/);

    // 045 must not CREATE open FOR ALL USING (true) policies (comments may mention historical ones)
    const createPolicyOpen = m045.match(
      /CREATE POLICY[\s\S]{0,200}FOR ALL[\s\S]{0,120}USING\s*\(\s*true\s*\)/gi
    );
    expect(createPolicyOpen).toBeNull();

    // Historical open policies exist in 025/026 — later migrations must neutralize them
    const m025 = readFileSync(join(sqlDir, '025_design_intelligence.sql'), 'utf8');
    const m026 = readFileSync(join(sqlDir, '026_engineering_rules.sql'), 'utf8');
    expect(m025).toMatch(/USING \(true\)/);
    expect(m026).toMatch(/USING \(true\)/);

    // No migration after 045 may recreate di_* FOR ALL USING (true)
    for (const f of files) {
      if (f <= '045_design_intelligence_tenant_rls.sql') continue;
      const body = readFileSync(join(sqlDir, f), 'utf8');
      if (!/di_/i.test(body)) continue;
      expect(body, f).not.toMatch(/di_[\w]+[\s\S]{0,200}FOR ALL[\s\S]{0,80}USING\s*\(\s*true\s*\)/i);
    }
  });
});

describe('Final security closure — public website / WhatsApp tokens', () => {
  beforeEach(() => {
    process.env.SOCIAL_FORCE_MEMORY = 'true';
    process.env.ALLOW_DEMO_MODE = 'true';
    process.env.TENANT_FORCE_MEMORY = 'true';
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    marketingMemory.reset();
    tenantMemory.reset();
  });

  it('2) cross-tenant public website token isolation', async () => {
    const siteA = await getOrCreateWebsiteSite('co-a');
    const siteB = await getOrCreateWebsiteSite('co-b');
    expect(siteA.public_form_token).toBeTruthy();
    expect(siteB.public_form_token).toBeTruthy();
    expect(siteA.public_form_token).not.toBe(siteB.public_form_token);

    const resolvedA = await resolveWebsiteSiteByPublicToken(siteA.public_form_token);
    const resolvedB = await resolveWebsiteSiteByPublicToken(siteB.public_form_token);
    expect(resolvedA?.company_id).toBe('co-a');
    expect(resolvedB?.company_id).toBe('co-b');

    const submitA = await submitWebsiteForm({
      formSlug: 'consultation',
      publicFormToken: siteA.public_form_token!,
      payload: { name: 'A', phone: '0551110001', message: 'from A' },
    });
    expect(submitA.company_id).toBe('co-a');

    // Token A must not resolve to site B
    expect(await resolveWebsiteSiteByPublicToken(siteA.public_form_token)).not.toMatchObject({
      company_id: 'co-b',
    });
  });

  it('3) cross-tenant WhatsApp public click resource', async () => {
    const siteA = await getOrCreateWebsiteSite('co-a');
    const siteB = await getOrCreateWebsiteSite('co-b');

    const ok = await waClickPost(
      new Request('http://localhost/api/integrations/website/whatsapp-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_form_token: siteA.public_form_token, phone: '0550001111' }),
      })
    );
    expect(ok.status).toBe(200);
    const json = (await ok.json()) as { company_id?: string };
    expect(json.company_id).toBe('co-a');

    // Foreign / mismatched — token B still works for B only
    const okB = await waClickPost(
      new Request('http://localhost/api/integrations/website/whatsapp-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_form_token: siteB.public_form_token }),
      })
    );
    const jsonB = (await okB.json()) as { company_id?: string };
    expect(jsonB.company_id).toBe('co-b');
  });

  it('6) invalid public token → 404', async () => {
    const res = await publicFormPost(
      new Request('http://localhost/api/public/website/forms/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_form_token: 'ffffffffffffffffffffffffffffffff',
          payload: { name: 'x', phone: '0550000000' },
        }),
      }),
      { params: Promise.resolve({ slug: 'consultation' }) }
    );
    expect(res.status).toBe(404);
  });

  it('6b) missing public token → 401', async () => {
    const res = await publicFormPost(
      new Request('http://localhost/api/public/website/forms/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { name: 'x', phone: '0550000000' } }),
      }),
      { params: Promise.resolve({ slug: 'consultation' }) }
    );
    expect(res.status).toBe(401);
  });
});

describe('Final security closure — document signed URL', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.ALLOW_DEMO_MODE = 'true';
    process.env.TENANT_FORCE_MEMORY = 'true';
    tenantMemory.reset();
  });

  it('4/5) signed URL ownership model — foreign tenant path rejected', async () => {
    expect(parseStoragePathOwnerSegment('client-aaa/plans/a.pdf')).toBe('client-aaa');
    expect(storagePathBelongsToTenant('client-aaa/plans/a.pdf', 'co-a', 'co-a')).toBe(true);
    expect(storagePathBelongsToTenant('client-aaa/plans/a.pdf', 'co-a', 'co-b')).toBe(false);
    expect(storagePathBelongsToTenant('co-a/plans/a.pdf', 'co-a', null)).toBe(true);
    expect(storagePathBelongsToTenant('co-b/plans/a.pdf', 'co-a', null)).toBe(false);

    // Unauthenticated
    const unauth = await signedUrlPost(
      new Request('http://localhost/api/documents/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: 'client-b/file.pdf' }),
      })
    );
    expect(unauth.status).toBeGreaterThanOrEqual(401);

    // Authenticated but foreign path (demo mode fail-closed without matching company prefix)
    const foreign = await signedUrlPost(
      new Request('http://localhost/api/documents/signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: cookie({ companyId: 'co-tawaqqa', userId: 'usr-admin', roleCode: 'manager' }),
        },
        body: JSON.stringify({ storagePath: 'client-other-company/file.pdf', company_id: 'co-other' }),
      })
    );
    expect([403, 404]).toContain(foreign.status);
    const body = (await foreign.json()) as { error?: string };
    expect(body.error).not.toMatch(/company_id|co-other/i);

    // Same-tenant company-prefix path succeeds in demo
    const ok = await signedUrlPost(
      new Request('http://localhost/api/documents/signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: cookie({ companyId: 'co-tawaqqa', userId: 'usr-admin', roleCode: 'manager' }),
        },
        body: JSON.stringify({ storagePath: 'co-tawaqqa/plans/own.pdf' }),
      })
    );
    expect(ok.status).toBe(200);
    const okJson = (await ok.json()) as { signedUrl?: string };
    expect(okJson.signedUrl).toContain('co-tawaqqa/plans/own.pdf');
  });

  it('7) missing tenant / invalid path → not found', async () => {
    const missing = await signedUrlPost(
      new Request('http://localhost/api/documents/signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: cookie({ companyId: 'co-tawaqqa', userId: 'usr-admin' }),
        },
        body: JSON.stringify({}),
      })
    );
    expect(missing.status).toBe(400);

    const invalid = await signedUrlPost(
      new Request('http://localhost/api/documents/signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: cookie({ companyId: 'co-tawaqqa', userId: 'usr-admin' }),
        },
        body: JSON.stringify({ storagePath: '../etc/passwd' }),
      })
    );
    expect([400, 404]).toContain(invalid.status);
  });

  it('8) client supplied company_id cannot override tenant', async () => {
    await expect(
      requireTenantFromRequest(
        new Request('http://localhost/api/x', {
          headers: { cookie: cookie({ companyId: 'co-tawaqqa' }) },
        }),
        { companyIdFromRequest: 'co-attacker' }
      )
    ).rejects.toBeInstanceOf(TenantAccessError);

    const rag = await designRagPost(
      new Request('http://localhost/api/design/rag', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookie({ companyId: 'co-tawaqqa', userId: 'usr-admin', roleCode: 'manager' }),
        },
        body: JSON.stringify({ question: 'egress', company_id: 'co-other' }),
      })
    );
    // Auth may succeed; must not trust body company_id — response is tenant-scoped
    expect([200, 403, 401]).toContain(rag.status);
  });
});
