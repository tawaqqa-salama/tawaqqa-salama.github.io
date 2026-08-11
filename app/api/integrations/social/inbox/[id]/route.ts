import { NextResponse } from 'next/server';
import { getConversationDetail } from '@/lib/social/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const { id } = await ctx.params;
  const detail = await getConversationDetail(id);
  if (!detail) return NextResponse.json({ ok: false, error: 'غير موجود' }, { status: 404 });
  return NextResponse.json({ ok: true, ...detail });
}
