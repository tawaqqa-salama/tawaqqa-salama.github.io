import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  encodeCookiePayload,
} from '@/lib/auth/session-cookie';
import { requireLivePlatformAdmin } from '@/lib/auth/platform-gate';
import { applyLiveActorToSession } from '@/lib/auth/session-actor';
import { writeSaasAudit } from '@/lib/tenant/audit';
import { tenantMemory } from '@/lib/tenant/memory';
import { getTenant } from '@/lib/tenant/service';
import { isDemoMode, isSupabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';

/** Explicit audited support access into a tenant context. */
export async function POST(request: Request) {
  const gate = await requireLivePlatformAdmin(request);
  if (!gate.ok) return gate.response;

  const body = await request.json();
  const companyId = body.companyId as string;
  const reason = (body.reason as string) || 'support';
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'companyId required' }, { status: 400 });
  }
  const tenant = await getTenant(companyId);
  if (!tenant) return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 });

  const actorId = gate.actor.user.id;
  if (!isSupabaseConfigured || isDemoMode || process.env.TENANT_FORCE_MEMORY === 'true') {
    tenantMemory.startSupport(actorId, companyId, reason);
  }

  await writeSaasAudit({
    actor_user_id: actorId,
    company_id: companyId,
    action: 'SUPPORT_IMPERSONATION_START',
    entity_type: 'support_session',
    entity_id: companyId,
    metadata: { reason },
  });

  const payload = {
    ...applyLiveActorToSession(gate.session, gate.actor),
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
