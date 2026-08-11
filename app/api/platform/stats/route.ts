import { NextResponse } from 'next/server';
import { requireLivePlatformAdmin } from '@/lib/auth/platform-gate';
import { platformStats } from '@/lib/tenant/service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireLivePlatformAdmin(request);
  if (!gate.ok) return gate.response;
  const stats = await platformStats();
  return NextResponse.json({ ok: true, stats });
}
