import { NextResponse } from 'next/server';
import { completeOAuth } from '@/lib/social/service';
import type { SocialPlatform } from '@/lib/social/types';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  ctx: { params: Promise<{ platform: string }> }
) {
  const { platform: raw } = await ctx.params;
  const platform = raw as SocialPlatform;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  if (err) {
    return NextResponse.redirect(
      new URL(`/marketing?tab=social&socialSub=accounts&oauth=error&msg=${encodeURIComponent(err)}`, url.origin)
    );
  }
  if (!code) {
    return NextResponse.json({ ok: false, error: 'missing code' }, { status: 400 });
  }

  const result = await completeOAuth(platform, code, url.origin, state);
  if (!result.ok) {
    const msg = !result.supported ? result.reason : result.error;
    return NextResponse.redirect(
      new URL(
        `/marketing?tab=social&socialSub=accounts&oauth=error&msg=${encodeURIComponent(msg)}`,
        url.origin
      )
    );
  }

  return NextResponse.redirect(
    new URL('/marketing?tab=social&socialSub=accounts&oauth=success', url.origin)
  );
}
