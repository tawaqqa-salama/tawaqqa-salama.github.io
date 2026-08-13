import { NextResponse } from 'next/server';
import { getWebsiteBundle } from '@/lib/website/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const bundle = await getWebsiteBundle(gated.ctx.tenantId);
  return NextResponse.json({ ok: true, ...bundle });
}
