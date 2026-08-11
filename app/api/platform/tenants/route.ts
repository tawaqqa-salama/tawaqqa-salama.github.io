import { NextResponse } from 'next/server';
import { requireLivePlatformAdmin } from '@/lib/auth/platform-gate';
import { createTenant, listTenants } from '@/lib/tenant/service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireLivePlatformAdmin(request);
  if (!gate.ok) return gate.response;
  const tenants = await listTenants();
  return NextResponse.json({ ok: true, tenants });
}

export async function POST(request: Request) {
  const gate = await requireLivePlatformAdmin(request);
  if (!gate.ok) return gate.response;
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
      actorUserId: gate.actor.user.id,
    });
    return NextResponse.json({ ok: true, tenant });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'create failed' },
      { status: 400 }
    );
  }
}
