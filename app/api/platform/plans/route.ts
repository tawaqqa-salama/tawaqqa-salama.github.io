import { NextResponse } from 'next/server';
import { listPlans } from '@/lib/tenant/service';

export const runtime = 'nodejs';

export async function GET() {
  const plans = await listPlans();
  return NextResponse.json({ ok: true, plans });
}
