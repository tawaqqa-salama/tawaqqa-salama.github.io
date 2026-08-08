import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, decodeCookiePayload } from '@/lib/auth/session-cookie';
import { listSaasAudit } from '@/lib/tenant/audit';
import { isSuperAdminRole } from '@/lib/tenant/rbac';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  const session = decodeCookiePayload(match?.[1] ? decodeURIComponent(match[1]) : null);
  if (!session || !isSuperAdminRole(session.roleCode)) {
    return NextResponse.json({ ok: false, error: 'Platform admin required' }, { status: 403 });
  }
  const companyId = new URL(request.url).searchParams.get('companyId') || undefined;
  const events = await listSaasAudit({ companyId, limit: 100 });
  return NextResponse.json({ ok: true, events });
}
