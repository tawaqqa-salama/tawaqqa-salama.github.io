import { NextResponse } from 'next/server';
import { memoryStore } from '@/lib/whatsapp/store/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = (url.searchParams.get('range') || '30d') as 'today' | '7d' | '30d' | 'custom';
  return NextResponse.json({ ok: true, stats: memoryStore.stats(range) });
}
