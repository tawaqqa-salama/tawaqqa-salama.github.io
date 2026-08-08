import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  decodeCookiePayload,
  encodeCookiePayload,
} from '@/lib/auth/session-cookie';
import { writeSaasAudit } from '@/lib/tenant/audit';
import { isSuperAdminRole } from '@/lib/tenant/rbac';
import { getTenant, getUserMemberships } from '@/lib/tenant/service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  const session = decodeCookiePayload(match?.[1] ? decodeURIComponent(match[1]) : null);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const companyId = body.companyId as string;
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'companyId required' }, { status: 400 });
  }

  if (!isSuperAdminRole(session.roleCode)) {
    const memberships = await getUserMemberships(session.userId);
    const ok = memberships.some(
      (m) => String((m as { company_id: string }).company_id) === companyId
    );
    if (!ok) {
      return NextResponse.json({ ok: false, error: 'Not a member of this tenant' }, { status: 403 });
    }
  }

  const tenant = await getTenant(companyId);
  if (!tenant || tenant.status === 'suspended') {
    return NextResponse.json({ ok: false, error: 'Tenant unavailable' }, { status: 403 });
  }

  await writeSaasAudit({
    actor_user_id: session.userId,
    company_id: companyId,
    action: 'TENANT_SWITCHED',
    entity_type: 'company',
    entity_id: companyId,
  });

  const res = NextResponse.json({ ok: true, tenant });
  res.cookies.set(AUTH_COOKIE_NAME, encodeCookiePayload({ ...session, companyId }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  return res;
}
