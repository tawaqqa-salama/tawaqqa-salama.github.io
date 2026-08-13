import { NextResponse } from 'next/server';
import { createOrUpdatePost, listPosts } from '@/lib/social/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const posts = await listPosts(gated.ctx.tenantId);
  return NextResponse.json({ ok: true, posts });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const body = await request.json();
  const post = await createOrUpdatePost({
    id: body.id,
    companyId: gated.ctx.tenantId,
    title: body.title,
    content: body.content || '',
    media: body.media,
    platforms: body.platforms || [],
    publish_at: body.publish_at,
    status: body.status,
    marketing_campaign_id: body.marketing_campaign_id,
    ai_suggested: body.ai_suggested,
  });
  return NextResponse.json({ ok: true, post });
}
