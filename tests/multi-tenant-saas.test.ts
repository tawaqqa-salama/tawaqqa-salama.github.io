import { beforeEach, describe, expect, it } from 'vitest';
import { formatCurrency, formatDate } from '@/lib/format/currency';
import { isAppLocale, localeDir } from '@/lib/i18n/types';
import { translate } from '@/lib/i18n/dictionary';
import { tenantMemory } from '@/lib/tenant/memory';
import {
  assertTenantRow,
  TenantAccessError,
} from '@/lib/tenant/context';
import { canCreateUser } from '@/lib/tenant/limits';
import { isSuperAdminRole, isTenantAdminRole, resolveSaasPermissions } from '@/lib/tenant/rbac';
import {
  createTenant,
  getTenant,
  getTenantModules,
  hasModule,
  listTenants,
  setTenantModules,
} from '@/lib/tenant/service';
import { POST as onboardingPost } from '@/app/api/onboarding/route';
import { GET as tenantsGet, POST as tenantsPost } from '@/app/api/platform/tenants/route';
import { GET as funnelGet } from '@/app/api/integrations/marketing/funnel/route';
import { POST as contractPost } from '@/app/api/contracts/auto-generate/route';
import { encodeCookiePayload, type CookieSessionPayload } from '@/lib/auth/session-cookie';

function cookieHeader(role = 'super_admin', companyId = 'co-tawaqqa', userId = 'usr-admin') {
  process.env.AUTH_SESSION_SECRET =
    process.env.AUTH_SESSION_SECRET || 'test-auth-session-secret-32chars!!';
  const payload: CookieSessionPayload = {
    userId,
    email: 'admin@tawaqqa.sa',
    fullName: 'Admin',
    roleCode: role,
    companyId,
    loggedInAt: new Date().toISOString(),
    method: 'email',
  };
  return `tawaqqa_auth=${encodeURIComponent(encodeCookiePayload(payload))}`;
}

describe('Multi-tenant SaaS', () => {
  beforeEach(() => {
    process.env.TENANT_FORCE_MEMORY = 'true';
    tenantMemory.reset();
  });

  it('lists existing TWAQQA and Indonesian pilot tenants', async () => {
    const tenants = await listTenants();
    expect(tenants.some((t) => t.code === 'TWAQQA')).toBe(true);
    expect(tenants.some((t) => t.code === 'IDN-PILOT')).toBe(true);
    const idn = await getTenant('idn-realestate-pilot');
    expect(idn?.default_currency).toBe('IDR');
    expect(idn?.default_language).toBe('en');
    expect(idn?.timezone).toBe('Asia/Jakarta');
  });

  it('creates a new tenant without exposing other tenant modules by default', async () => {
    const created = await createTenant({
      name: 'Second Company',
      code: 'SEC-01',
      country: 'ID',
      defaultLanguage: 'en',
      secondaryLanguage: 'id',
      defaultCurrency: 'IDR',
      modules: ['crm', 'projects', 'settings'],
    });
    expect(created.id).toBeTruthy();
    const mods = await getTenantModules(created.id);
    expect(mods).toContain('crm');
    expect(mods).not.toContain('finance_zatca');
    const tawaqqaMods = await getTenantModules('co-tawaqqa');
    expect(tawaqqaMods).toContain('finance_zatca');
  });

  it('enforces module flags', async () => {
    await setTenantModules('co-idn-pilot', ['crm', 'projects', 'settings']);
    expect(await hasModule('co-idn-pilot', 'crm')).toBe(true);
    expect(await hasModule('co-idn-pilot', 'finance')).toBe(false);
  });

  it('blocks cross-tenant row access (IDOR helper)', () => {
    const ctx = {
      session: {
        userId: 'usr-sales',
        email: 's@x.com',
        fullName: 'S',
        roleCode: 'sales',
        companyId: 'co-tawaqqa',
        loggedInAt: new Date().toISOString(),
        method: 'email' as const,
      },
      tenantId: 'co-tawaqqa',
      tenant: tenantMemory.getTenant('co-tawaqqa')!,
      roleCode: 'sales',
      isPlatformAdmin: false,
      supportMode: false,
    };
    expect(() => assertTenantRow(ctx, 'co-idn-pilot', 'client')).toThrow(TenantAccessError);
    expect(() => assertTenantRow(ctx, 'co-tawaqqa', 'client')).not.toThrow();
  });

  it('RBAC distinguishes super admin and tenant admin', () => {
    expect(isSuperAdminRole('super_admin')).toBe(true);
    expect(isSuperAdminRole('tenant_admin')).toBe(false);
    expect(isTenantAdminRole('admin')).toBe(true);
    expect(resolveSaasPermissions('viewer')).toContain('projects.view');
    expect(resolveSaasPermissions('viewer')).not.toContain('clients.create');
  });

  it('enforces user limits server-side', async () => {
    const tiny = await createTenant({
      name: 'Tiny',
      code: 'TINY',
      max_users: 1,
    } as never);
    // manually shrink limit
    const t = tenantMemory.getTenant(tiny.id)!;
    t.max_users = 0;
    tenantMemory.saveTenant(t);
    const check = await canCreateUser(tiny.id);
    expect(check.ok).toBe(false);
  });

  it('platform tenants API requires super admin', async () => {
    const denied = await tenantsGet(
      new Request('http://localhost/api/platform/tenants', {
        headers: { cookie: cookieHeader('sales') },
      })
    );
    expect(denied.status).toBe(403);

    const ok = await tenantsGet(
      new Request('http://localhost/api/platform/tenants', {
        headers: { cookie: cookieHeader('super_admin') },
      })
    );
    const json = await ok.json();
    expect(json.ok).toBe(true);
    expect(json.tenants.length).toBeGreaterThanOrEqual(2);
  });

  it('super admin can create tenant via API', async () => {
    const res = await tenantsPost(
      new Request('http://localhost/api/platform/tenants', {
        method: 'POST',
        headers: {
          cookie: cookieHeader('super_admin'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Bali Homes',
          country: 'ID',
          defaultLanguage: 'en',
          secondaryLanguage: 'id',
          defaultCurrency: 'IDR',
          timezone: 'Asia/Makassar',
          industry: 'real_estate',
          modules: ['crm', 'projects', 'documents', 'reports', 'settings'],
        }),
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.tenant.default_currency).toBe('IDR');
  });

  it('onboarding creates Indonesian-ready tenant', async () => {
    const res = await onboardingPost(
      new Request('http://localhost/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: 'Nusantara Development',
          legalName: 'PT Nusantara Development',
          country: 'ID',
          city: 'Jakarta',
          defaultLanguage: 'en',
          secondaryLanguage: 'id',
          defaultCurrency: 'IDR',
          timezone: 'Asia/Jakarta',
          industry: 'real_estate',
          adminName: 'Budi Santoso',
          adminEmail: 'budi@nusantara.example',
          adminPassword: 'SecurePass1',
        }),
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.tenant.default_currency).toBe('IDR');
    expect(json.tenant.default_language).toBe('en');
  });

  it('supports en/id/ar locales with correct direction', () => {
    expect(isAppLocale('id')).toBe(true);
    expect(localeDir('ar')).toBe('rtl');
    expect(localeDir('en')).toBe('ltr');
    expect(localeDir('id')).toBe('ltr');
    expect(translate('id', 'platform.title')).toContain('Platform');
    expect(translate('en', 'platform.tenants')).toBe('Tenants');
    expect(translate('ar', 'platform.tenants')).toContain('الشركات');
  });

  it('formats currency per tenant currency', () => {
    expect(formatCurrency(1000, { currency: 'IDR', locale: 'id-ID' })).toMatch(/1/);
    // Arabic-Indic digits for SAR/ar-SA — assert currency symbol/code presence
    expect(formatCurrency(10, { currency: 'SAR', locale: 'en-US' })).toMatch(/10/);
    expect(formatCurrency(10, { currency: 'SAR' })).toMatch(/ر\.س|SAR|﷼/);
    expect(formatDate('2026-08-08', 'id')).toBeTruthy();
  });

  it('creating a tenant does not merge into TWAQQA data set', async () => {
    const before = await listTenants();
    const tawaqqaBefore = before.find((t) => t.code === 'TWAQQA')!;
    await createTenant({ name: 'Isolated Co', code: 'ISO-1', country: 'ID' });
    const after = await getTenant('TWAQQA');
    expect(after?.id).toBe(tawaqqaBefore.id);
    expect(after?.name).toBe(tawaqqaBefore.name);
  });

  it('marketing funnel API requires tenant auth', async () => {
    const unauth = await funnelGet(new Request('http://localhost/api/integrations/marketing/funnel'));
    expect(unauth.status).toBe(401);

    const ok = await funnelGet(
      new Request('http://localhost/api/integrations/marketing/funnel', {
        headers: { cookie: cookieHeader('sales', 'co-tawaqqa') },
      })
    );
    expect(ok.status).toBe(200);
    const json = await ok.json();
    expect(json.ok).toBe(true);
  });

  it('contract generate rejects missing auth (cross-tenant IDOR gate)', async () => {
    const res = await contractPost(
      new Request('http://localhost/api/contracts/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: 'someone-elses-id' }),
      })
    );
    expect(res.status).toBe(401);
  });
});
