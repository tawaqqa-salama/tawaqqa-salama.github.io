import { NextResponse } from 'next/server';
import { loadEkbTopics, resolveEkbHints } from '@/lib/compliance/ekb-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = (searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length) {
    const topics = await resolveEkbHints(ids);
    return NextResponse.json({ ok: true, topics });
  }

  const topics = await loadEkbTopics();
  return NextResponse.json({ ok: true, topics });
}
