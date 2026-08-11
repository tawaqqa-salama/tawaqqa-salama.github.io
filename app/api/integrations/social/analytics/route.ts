import { NextResponse } from 'next/server';
import { campaignPerformance } from '@/lib/marketing/campaigns';
import { getDashboardStats, listSocialAccounts, syncAccountAnalytics } from '@/lib/social/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const tenantId = gated.ctx.tenantId;
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '30d';
  const accountId = url.searchParams.get('accountId');
  if (accountId) {
    const synced = await syncAccountAnalytics(accountId, tenantId);
    return NextResponse.json(synced);
  }
  const [stats, accounts, campaigns] = await Promise.all([
    getDashboardStats(range, tenantId),
    listSocialAccounts(tenantId),
    campaignPerformance(undefined, tenantId),
  ]);
  return NextResponse.json({
    ok: true,
    stats,
    accounts,
    campaigns,
  });
}
