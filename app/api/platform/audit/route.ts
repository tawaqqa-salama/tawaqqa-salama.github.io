import { NextResponse } from 'next/server';
import { requireLivePlatformAdmin } from '@/lib/auth/platform-gate';
import { listSaasAudit } from '@/lib/tenant/audit';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gate = await requireLivePlatformAdmin(request);
  if (!gate.ok) return gate.response;
  const companyId = new URL(request.url).searchParams.get('companyId') || undefined;
  const events = await listSaasAudit({ companyId, limit: 100 });
  return NextResponse.json({ ok: true, events });
}
