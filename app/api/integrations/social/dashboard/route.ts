import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/social/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const range = new URL(request.url).searchParams.get('range') || '30d';
  const stats = await getDashboardStats(range);
  return NextResponse.json({ ok: true, ...stats });
}
