import { NextResponse } from 'next/server';
import { listBlogPosts, saveBlogPost } from '@/lib/website/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const posts = await listBlogPosts();
  return NextResponse.json({ ok: true, posts });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const body = await request.json();
  const post = await saveBlogPost(body);
  return NextResponse.json({ ok: true, post });
}
