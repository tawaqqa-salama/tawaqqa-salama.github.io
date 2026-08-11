import { NextResponse } from 'next/server';
import { requireLivePlatformAdmin } from '@/lib/auth/platform-gate';
import { getTenant, setTenantModules, updateTenant } from '@/lib/tenant/service';
import { writeSaasAudit } from '@/lib/tenant/audit';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireLivePlatformAdmin(request);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const tenant = await getTenant(id);
  if (!tenant) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, tenant });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireLivePlatformAdmin(request);
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  const body = await request.json();
  const actorId = gate.actor.user.id;

  if (Array.isArray(body.modules)) {
    await setTenantModules(id, body.modules, actorId);
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
      actor_user_id: actorId,
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
    ? await updateTenant(id, patch as never, actorId)
    : await getTenant(id);

  return NextResponse.json({ ok: true, tenant });
}
