import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/social/service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const range = new URL(request.url).searchParams.get('range') || '30d';
  const stats = await getDashboardStats(range);
  return NextResponse.json({ ok: true, ...stats });
}
