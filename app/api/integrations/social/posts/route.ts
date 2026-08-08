import { NextResponse } from 'next/server';
import { createOrUpdatePost, listPosts } from '@/lib/social/service';

export const runtime = 'nodejs';

export async function GET() {
  const posts = await listPosts();
  return NextResponse.json({ ok: true, posts });
}

export async function POST(request: Request) {
  const body = await request.json();
  const post = await createOrUpdatePost({
    id: body.id,
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
