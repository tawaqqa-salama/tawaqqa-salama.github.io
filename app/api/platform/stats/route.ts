import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, decodeCookiePayload } from '@/lib/auth/session-cookie';
import { isSuperAdminRole } from '@/lib/tenant/rbac';
import { platformStats } from '@/lib/tenant/service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  const session = decodeCookiePayload(match?.[1] ? decodeURIComponent(match[1]) : null);
  if (!session || !isSuperAdminRole(session.roleCode)) {
    return NextResponse.json({ ok: false, error: 'Platform admin required' }, { status: 403 });
  }
  const stats = await platformStats();
  return NextResponse.json({ ok: true, stats });
}
