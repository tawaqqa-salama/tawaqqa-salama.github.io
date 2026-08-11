import { NextResponse } from 'next/server';
import { campaignPerformance, listMarketingCampaigns, saveMarketingCampaign } from '@/lib/marketing/campaigns';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'marketing' });
  if ('response' in gated) return gated.response;
  const tenantId = gated.ctx.tenantId;
  const withPerf = new URL(request.url).searchParams.get('performance') === '1';
  if (withPerf) {
    const rows = await campaignPerformance(undefined, tenantId);
    return NextResponse.json({ ok: true, campaigns: rows });
  }
  const campaigns = await listMarketingCampaigns(tenantId);
  return NextResponse.json({ ok: true, campaigns });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'marketing' });
  if ('response' in gated) return gated.response;
  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ ok: false, error: 'name مطلوب' }, { status: 400 });
  }
  // Ignore client-supplied company_id — session tenant only
  const safe = { ...(body as Record<string, unknown>) };
  delete safe.company_id;
  delete safe.companyId;
  const campaign = await saveMarketingCampaign({
    ...(safe as Parameters<typeof saveMarketingCampaign>[0]),
    companyId: gated.ctx.tenantId,
  });
  return NextResponse.json({ ok: true, campaign });
}
