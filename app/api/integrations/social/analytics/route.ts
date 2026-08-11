import { NextResponse } from 'next/server';
import { campaignPerformance } from '@/lib/marketing/campaigns';
import { getDashboardStats, listSocialAccounts, syncAccountAnalytics } from '@/lib/social/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '30d';
  const accountId = url.searchParams.get('accountId');
  if (accountId) {
    const synced = await syncAccountAnalytics(accountId);
    return NextResponse.json(synced);
  }
  const [stats, accounts, campaigns] = await Promise.all([
    getDashboardStats(range),
    listSocialAccounts(),
    campaignPerformance(),
  ]);
  return NextResponse.json({
    ok: true,
    stats,
    accounts,
    campaigns,
  });
}
