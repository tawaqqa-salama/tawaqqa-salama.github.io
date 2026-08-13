import { NextResponse } from 'next/server';
import { listWebsiteServices, saveWebsiteService } from '@/lib/website/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const rows = await listWebsiteServices(gated.ctx.tenantId);
  return NextResponse.json({ ok: true, services: rows });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const body = await request.json();
  const row = await saveWebsiteService(body, gated.ctx.tenantId);
  return NextResponse.json({ ok: true, service: row });
}
