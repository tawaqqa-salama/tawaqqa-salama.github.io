/**
 * Platform audit — security regression tests (Phase 17).
 * Confirmed multi-tenant / auth / compliance gates — no invented thresholds.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_COOKIE_NAME,
  encodeCookiePayload,
  type CookieSessionPayload,
} from '@/lib/auth/session-cookie';
import {
  assertTenantRow,
  TenantAccessError,
  requireTenantFromRequest,
  type TenantContext,
} from '@/lib/tenant/context';
import { requireRowTenant, requireTenantId } from '@/lib/tenant/resource-scope';
import { tenantMemory } from '@/lib/tenant/memory';
import { resolveSaasPermissions } from '@/lib/tenant/rbac';
import { waRepository } from '@/lib/whatsapp/store/repository';
import { getMemoryDb, resetMemoryDb } from '@/lib/whatsapp/store/memory';
import { POST as designRagPost } from '@/app/api/design/rag/route';
import {
  GET as campaignsGet,
  POST as campaignsPost,
} from '@/app/api/integrations/marketing/campaigns/route';
import { GET as waConvGet } from '@/app/api/integrations/whatsapp/conversations/[id]/route';
import { GET as socialInboxGet } from '@/app/api/integrations/social/inbox/[id]/route';
import { GET as zatcaStatusGet } from '@/app/api/zatca/status/route';
import {
  countSbc201CodeTableRequired,
  countSbc201VerifiedThresholds,
  evaluateRule,
  getComplianceRuleById,
  type ComplianceRuleContext,
} from '@/lib/projects/compliance';

function cookie(overrides: Partial<CookieSessionPayload> = {}) {
  process.env.AUTH_SESSION_SECRET =
    process.env.AUTH_SESSION_SECRET || 'test-auth-session-secret-32chars!!';
  const payload: CookieSessionPayload = {
    userId: 'usr-a',
    email: 'a@company-a.test',
    fullName: 'User A',
    roleCode: 'manager',
    companyId: 'co-a',
    loggedInAt: new Date().toISOString(),
    method: 'email',
    ...overrides,
  };
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(encodeCookiePayload(payload))}`;
}

function mockTenantCtx(tenantId: string): TenantContext {
  return {
    session: {
      userId: 'usr-a',
      email: 'a@co-a.test',
      fullName: 'A',
      roleCode: 'manager',
      companyId: tenantId,
      loggedInAt: new Date().toISOString(),
      method: 'email',
    },
    tenantId,
    tenant: {
      id: tenantId,
      name: 'Co',
      code: 'CO',
      status: 'active',
      country: 'SA',
      default_language: 'ar',
      secondary_language: null,
      default_currency: 'SAR',
      timezone: 'Asia/Riyadh',
      created_at: new Date().toISOString(),
    } as unknown as TenantContext['tenant'],
    roleCode: 'manager',
    isPlatformAdmin: false,
    supportMode: false,
  };
}

function emptyCtx(partial: Partial<ComplianceRuleContext> = {}): ComplianceRuleContext {
  const base: ComplianceRuleContext = {
    evaluatedAt: new Date().toISOString(),
    client: {},
    building: { special_conditions: [] },
    occupancyZones: [],
    egress: { metrics: [] },
    fireAccess: {},
    fireProtection: { applicable_codes: [] },
    hydraulic: { has_network_data: false, attachment_count: 0 },
    fireAlarm: {},
    smokeControl: {},
    overrides: [],
  };
  return {
    ...base,
    ...partial,
    building: { ...base.building, ...(partial.building || {}) },
    egress: { ...base.egress, ...(partial.egress || {}) },
    fireAccess: { ...base.fireAccess, ...(partial.fireAccess || {}) },
    fireProtection: { ...base.fireProtection, ...(partial.fireProtection || {}) },
    hydraulic: { ...base.hydraulic, ...(partial.hydraulic || {}) },
  };
}

describe('Platform audit — security regressions (2026-08)', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'test-auth-session-secret-32chars!!';
    process.env.ALLOW_DEMO_MODE = 'true';
    process.env.TENANT_FORCE_MEMORY = 'true';
    process.env.WHATSAPP_CRM_FORCE_MEMORY = 'true';
    process.env.MARKETING_CRM_FORCE_MEMORY = 'true';
    tenantMemory.reset();
    resetMemoryDb();
  });

  it('TEST 1: Company A cannot read Company B project (assertTenantRow)', () => {
    const ctx = mockTenantCtx('co-a');
    expect(() => assertTenantRow(ctx, 'co-b', 'project')).toThrow(TenantAccessError);
    expect(requireRowTenant(ctx, 'co-b', 'project')?.status).toBe(404);
    expect(requireRowTenant(ctx, 'co-a', 'project')).toBeNull();
  });

  it('TEST 2: Company A cannot read Company B report (404, no existence leak)', () => {
    const res = requireRowTenant(mockTenantCtx('co-a'), 'co-b', 'report');
    expect(res?.status).toBe(404);
  });

  it('TEST 3: Company A cannot download Company B document (scoped ownership)', () => {
    expect(requireTenantId(null)).toBe(false);
    expect(requireTenantId('co-a')).toBe(true);
    expect(requireRowTenant(mockTenantCtx('co-a'), 'co-b', 'document')?.status).toBe(404);
  });

  it('TEST 4: Viewer cannot mutate projects (permission model)', () => {
    const viewer = resolveSaasPermissions('viewer');
    const engineer = resolveSaasPermissions('engineer');
    expect(viewer.includes('projects.edit')).toBe(false);
    expect(engineer.includes('projects.edit')).toBe(true);
  });

  it('TEST 5: Unauthenticated user cannot access protected API', async () => {
    const res = await campaignsGet(
      new Request('http://localhost/api/integrations/marketing/campaigns')
    );
    expect(res.status).toBeGreaterThanOrEqual(401);
    const rag = await designRagPost(
      new Request('http://localhost/api/design/rag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'test' }),
      })
    );
    expect(rag.status).toBeGreaterThanOrEqual(401);
  });

  it('TEST 6: Client supplied company_id cannot override session tenant', async () => {
    await expect(
      requireTenantFromRequest(
        new Request('http://localhost/api/x', {
          headers: { cookie: cookie({ companyId: 'co-a' }) },
        }),
        { companyIdFromRequest: 'co-b' }
      )
    ).rejects.toBeInstanceOf(TenantAccessError);

    const res = await campaignsPost(
      new Request('http://localhost/api/integrations/marketing/campaigns', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookie({ companyId: 'co-a', roleCode: 'manager' }),
        },
        body: JSON.stringify({
          name: 'Audit Campaign',
          company_id: 'co-b',
          companyId: 'co-b',
        }),
      })
    );
    if (res.ok) {
      const json = (await res.json()) as { campaign?: { company_id?: string } };
      expect(json.campaign?.company_id).not.toBe('co-b');
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('TEST 7: Invalid / foreign conversation id does not leak data', async () => {
    const db = getMemoryDb();
    const t = new Date().toISOString();
    db.conversations.push({
      id: 'wa-conv-b',
      company_id: 'co-other-tenant',
      customer_id: 'client-b',
      whatsapp_account_id: null,
      phone_number: '966500000001',
      status: 'open',
      assigned_user_id: null,
      unread_count: 1,
      last_message_at: t,
      last_message_preview: null,
      service_window_expires_at: null,
      created_at: t,
      updated_at: t,
    });

    const foreign = await waRepository.getConversation('wa-conv-b', 'co-tawaqqa');
    expect(foreign).toBeNull();

    const api = await waConvGet(
      new Request('http://localhost/api/integrations/whatsapp/conversations/wa-conv-b', {
        headers: {
          cookie: cookie({
            companyId: 'co-tawaqqa',
            roleCode: 'manager',
            userId: 'usr-admin',
          }),
        },
      }),
      { params: Promise.resolve({ id: 'wa-conv-b' }) }
    );
    expect(api.status).toBe(404);
    const body = (await api.json()) as { error?: string };
    expect(body.error).toBe('not_found');

    const social = await socialInboxGet(
      new Request('http://localhost/api/integrations/social/inbox/missing-id', {
        headers: {
          cookie: cookie({
            companyId: 'co-tawaqqa',
            roleCode: 'manager',
            userId: 'usr-admin',
          }),
        },
      }),
      { params: Promise.resolve({ id: 'missing-id' }) }
    );
    expect(social.status).toBe(404);
  });

  it('TEST 8: SBC missing threshold cannot produce PASS', () => {
    const rule = getComplianceRuleById('EGR-TRAVEL-DISTANCE');
    expect(rule).toBeTruthy();
    const result = evaluateRule(
      rule!,
      emptyCtx({
        building: { occupancy_classification: 'B', special_conditions: [] },
        egress: {
          metrics: [],
          sprinkler_status: 'sprinklered',
          travel_distance_m: 40,
          path_geometry_documented: true,
        },
      })
    );
    expect(result.status).not.toBe('PASS');
    expect(['NEEDS_DATA', 'BLOCKED', 'N/A', 'FAIL']).toContain(result.status);
    expect(countSbc201VerifiedThresholds()).toBe(0);
    expect(countSbc201CodeTableRequired()).toBeGreaterThan(0);
  });

  it('ZATCA status requires authentication', async () => {
    const res = await zatcaStatusGet(new Request('http://localhost/api/zatca/status'));
    expect(res.status).toBeGreaterThanOrEqual(401);
  });
});
