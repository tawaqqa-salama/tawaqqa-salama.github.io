import { NextResponse } from 'next/server';
import { withTenantApi } from '@/lib/tenant/api-guard';
import {
  createOrUpdatePost,
  deletePost,
  duplicatePost,
  publishPostNow,
} from '@/lib/social/service';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const { id } = await ctx.params;
  const body = await request.json();
  if (body.action === 'publish') {
    const result = await publishPostNow(id);
    return NextResponse.json(result);
  }
  if (body.action === 'duplicate') {
    const post = await duplicatePost(id);
    return NextResponse.json({ ok: Boolean(post), post });
  }
  if (body.action === 'reschedule') {
    const post = await createOrUpdatePost({
      id,
      content: body.content,
      title: body.title,
      platforms: body.platforms,
      media: body.media,
      publish_at: body.publish_at,
      status: 'scheduled',
      marketing_campaign_id: body.marketing_campaign_id,
    });
    return NextResponse.json({ ok: true, post });
  }
  const post = await createOrUpdatePost({ id, ...body });
  return NextResponse.json({ ok: true, post });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const { id } = await ctx.params;
  await deletePost(id);
  return NextResponse.json({ ok: true });
}
