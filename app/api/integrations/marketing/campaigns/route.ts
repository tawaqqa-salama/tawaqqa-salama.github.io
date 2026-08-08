import { NextResponse } from 'next/server';
import { campaignPerformance, listMarketingCampaigns, saveMarketingCampaign } from '@/lib/marketing/campaigns';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const withPerf = new URL(request.url).searchParams.get('performance') === '1';
  if (withPerf) {
    const rows = await campaignPerformance();
    return NextResponse.json({ ok: true, campaigns: rows });
  }
  const campaigns = await listMarketingCampaigns();
  return NextResponse.json({ ok: true, campaigns });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ ok: false, error: 'name مطلوب' }, { status: 400 });
  }
  const campaign = await saveMarketingCampaign(body);
  return NextResponse.json({ ok: true, campaign });
}
