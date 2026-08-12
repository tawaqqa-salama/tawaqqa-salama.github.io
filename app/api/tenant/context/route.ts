import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, decodeCookiePayload } from '@/lib/auth/session-cookie';
import { getTenant, getTenantModules, getUserMemberships } from '@/lib/tenant/service';
import { isSuperAdminRole } from '@/lib/tenant/rbac';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  const session = decodeCookiePayload(match?.[1] ? decodeURIComponent(match[1]) : null);
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let companyId = session.companyId;
  if (!companyId) {
    const memberships = await getUserMemberships(session.userId);
    companyId = memberships[0] ? String(memberships[0].company_id) : undefined;
  }
  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'No tenant' }, { status: 400 });
  }

  const tenant = await getTenant(companyId);
  const modules = await getTenantModules(companyId);
  const memberships = await getUserMemberships(session.userId);

  return NextResponse.json({
    ok: true,
    tenant,
    modules,
    memberships,
    isPlatformAdmin: isSuperAdminRole(session.roleCode),
    roleCode: session.roleCode,
  });
}
