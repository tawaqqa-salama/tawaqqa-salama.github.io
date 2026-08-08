import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, decodeCookiePayload } from '@/lib/auth/session-cookie';
import { isSuperAdminRole } from '@/lib/tenant/rbac';
import { createTenant, listTenants } from '@/lib/tenant/service';

export const runtime = 'nodejs';

function sessionFrom(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  return decodeCookiePayload(match?.[1] ? decodeURIComponent(match[1]) : null);
}

export async function GET(request: Request) {
  const session = sessionFrom(request);
  if (!session || !isSuperAdminRole(session.roleCode)) {
    return NextResponse.json({ ok: false, error: 'Platform admin required' }, { status: 403 });
  }
  const tenants = await listTenants();
  return NextResponse.json({ ok: true, tenants });
}

export async function POST(request: Request) {
  const session = sessionFrom(request);
  if (!session || !isSuperAdminRole(session.roleCode)) {
    return NextResponse.json({ ok: false, error: 'Platform admin required' }, { status: 403 });
  }
  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
  }
  try {
    const tenant = await createTenant({
      ...body,
      legalName: body.legalName || body.legal_name,
      defaultLanguage: body.defaultLanguage || body.default_language,
      secondaryLanguage: body.secondaryLanguage || body.secondary_language,
      defaultCurrency: body.defaultCurrency || body.default_currency,
      planCode: body.planCode || body.plan_code,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, tenant });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'create failed' },
      { status: 400 }
    );
  }
}
