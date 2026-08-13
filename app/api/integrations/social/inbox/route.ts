import { NextResponse } from 'next/server';
import { listInbox } from '@/lib/social/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const conversations = await listInbox(gated.ctx.tenantId);
  return NextResponse.json({ ok: true, conversations });
}
