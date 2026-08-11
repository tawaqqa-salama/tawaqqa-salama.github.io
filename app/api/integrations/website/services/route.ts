import { NextResponse } from 'next/server';
import { listWebsiteServices, saveWebsiteService } from '@/lib/website/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const services = await listWebsiteServices();
  return NextResponse.json({ ok: true, services });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const body = await request.json();
  const service = await saveWebsiteService(body);
  return NextResponse.json({ ok: true, service });
}
