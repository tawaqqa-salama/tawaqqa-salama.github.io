import { NextResponse } from 'next/server';
import { getConversationDetail } from '@/lib/social/service';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const detail = await getConversationDetail(id);
  if (!detail) return NextResponse.json({ ok: false, error: 'غير موجود' }, { status: 404 });
  return NextResponse.json({ ok: true, ...detail });
}
