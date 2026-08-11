import { NextResponse } from 'next/server';
import { listWebsiteForms, saveWebsiteForm } from '@/lib/website/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const rows = await listWebsiteForms(gated.ctx.tenantId);
  return NextResponse.json({ ok: true, forms: rows });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const body = await request.json();
  const row = await saveWebsiteForm(body, gated.ctx.tenantId);
  return NextResponse.json({ ok: true, form: row });
}
