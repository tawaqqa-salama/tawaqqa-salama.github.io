import { NextResponse } from 'next/server';
import { listBlogPosts, saveBlogPost } from '@/lib/website/service';

export const runtime = 'nodejs';

export async function GET() {
  const posts = await listBlogPosts();
  return NextResponse.json({ ok: true, posts });
}

export async function POST(request: Request) {
  const body = await request.json();
  const post = await saveBlogPost(body);
  return NextResponse.json({ ok: true, post });
}
