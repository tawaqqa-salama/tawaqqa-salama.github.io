import { NextResponse } from 'next/server';
import { submitWebsiteForm } from '@/lib/website/service';

export const runtime = 'nodejs';

/** Public form endpoint (no session) — rate-limit via host infra. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  try {
    const result = await submitWebsiteForm({
      formSlug: slug,
      payload: body.payload || body,
      utm: body.utm,
      landing_page: body.landing_page,
      referrer: body.referrer || request.headers.get('referer'),
      user_agent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'submit failed' },
      { status: 400 }
    );
  }
}
