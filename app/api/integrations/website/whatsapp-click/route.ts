import { NextResponse } from 'next/server';
import { trackWebsiteWhatsAppClick } from '@/lib/website/service';
import { asTrimmedString } from '@/lib/validation/input';

export const runtime = 'nodejs';

/** Public WhatsApp click tracking — requires public_form_token (no session). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const token = asTrimmedString(
    body.public_form_token || body.token || request.headers.get('x-website-token'),
    128
  );
  if (!token) {
    return NextResponse.json({ ok: false, error: 'token_required' }, { status: 401 });
  }

  try {
    const result = await trackWebsiteWhatsAppClick({
      publicFormToken: token,
      phone: typeof body.phone === 'string' ? body.phone : null,
      utm: typeof body.utm === 'object' && body.utm ? (body.utm as Record<string, string>) : undefined,
      landing_page: typeof body.landing_page === 'string' ? body.landing_page : null,
      referrer: typeof body.referrer === 'string' ? body.referrer : null,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'track failed';
    const status = msg === 'invalid_public_token' ? 404 : 400;
    return NextResponse.json(
      { ok: false, error: msg === 'invalid_public_token' ? 'not_found' : 'track_failed' },
      { status }
    );
  }
}
