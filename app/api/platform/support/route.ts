import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, decodeCookiePayload, encodeCookiePayload } from '@/lib/auth/session-cookie';
import { AUTH_COOKIE_MAX_AGE } from '@/lib/auth/session-cookie';
import { writeSaasAudit } from '@/lib/tenant/audit';
import { tenantMemory } from '@/lib/tenant/memory';
import { isSuperAdminRole } from '@/lib/tenant/rbac';
import { getTenant } from '@/lib/tenant/service';
import { isDemoMode, isSupabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';

/** Explicit audited support access into a tenant context. */
export async function POST(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  const session = decodeCookiePayload(match?.[1] ? decodeURIComponent(match[1]) : null);
  if (!session || !isSuperAdminRole(session.roleCode)) {
    return NextResponse.json({ ok: false, error: 'Platform admin required' }, { status: 403 });
  }
  const body = await request.json();
  const companyId = body.companyId as string;
  const reason = (body.reason as string) || 'support';
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'companyId required' }, { status: 400 });
  }
  const tenant = await getTenant(companyId);
  if (!tenant) return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });

  if (!isSupabaseConfigured || isDemoMode || process.env.TENANT_FORCE_MEMORY === 'true') {
    tenantMemory.startSupport(session.userId, companyId, reason);
  }

  await writeSaasAudit({
    actor_user_id: session.userId,
    company_id: companyId,
    action: 'SUPPORT_IMPERSONATION_START',
    entity_type: 'support_session',
    entity_id: companyId,
    metadata: { reason },
  });

  const payload = {
    ...session,
    companyId,
  };
  const res = NextResponse.json({ ok: true, tenant, support: true });
  res.cookies.set(AUTH_COOKIE_NAME, encodeCookiePayload(payload), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  return res;
}
