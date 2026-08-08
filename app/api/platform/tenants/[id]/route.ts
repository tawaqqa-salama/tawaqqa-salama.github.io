import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, decodeCookiePayload } from '@/lib/auth/session-cookie';
import { isSuperAdminRole } from '@/lib/tenant/rbac';
import { getTenant, setTenantModules, updateTenant } from '@/lib/tenant/service';
import { writeSaasAudit } from '@/lib/tenant/audit';

export const runtime = 'nodejs';

function sessionFrom(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  return decodeCookiePayload(match?.[1] ? decodeURIComponent(match[1]) : null);
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = sessionFrom(request);
  if (!session || !isSuperAdminRole(session.roleCode)) {
    return NextResponse.json({ ok: false, error: 'Platform admin required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const tenant = await getTenant(id);
  if (!tenant) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, tenant });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = sessionFrom(request);
  if (!session || !isSuperAdminRole(session.roleCode)) {
    return NextResponse.json({ ok: false, error: 'Platform admin required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await request.json();

  if (Array.isArray(body.modules)) {
    await setTenantModules(id, body.modules, session.userId);
  }

  const patch: Record<string, unknown> = {};
  for (const key of [
    'name',
    'legal_name',
    'country',
    'city',
    'address',
    'phone',
    'email',
    'website',
    'default_language',
    'secondary_language',
    'default_currency',
    'timezone',
    'industry',
    'status',
    'subscription_status',
    'subscription_plan',
    'is_active',
    'max_users',
    'max_projects',
    'logo_url',
  ]) {
    if (key in body) patch[key] = body[key];
  }
  if (body.status === 'suspended') {
    patch.is_active = false;
    await writeSaasAudit({
      actor_user_id: session.userId,
      company_id: id,
      action: 'TENANT_SUSPENDED',
      entity_type: 'company',
      entity_id: id,
    });
  }
  if (body.status === 'active') {
    patch.is_active = true;
  }

  const tenant = Object.keys(patch).length
    ? await updateTenant(id, patch as never, session.userId)
    : await getTenant(id);

  return NextResponse.json({ ok: true, tenant });
}
