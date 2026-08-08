import { NextResponse } from 'next/server';
import { getWebsiteBundle } from '@/lib/website/service';

export const runtime = 'nodejs';

export async function GET() {
  const bundle = await getWebsiteBundle();
  return NextResponse.json({ ok: true, ...bundle });
}
