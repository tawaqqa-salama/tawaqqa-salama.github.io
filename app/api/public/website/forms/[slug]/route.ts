import { NextResponse } from 'next/server';
import { submitWebsiteForm } from '@/lib/website/service';
import {
  asTrimmedString,
  consumeRateLimit,
  sanitizePlainText,
} from '@/lib/validation/input';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 32_768;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

/** Public form endpoint (no session) — validated + lightly rate-limited. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const safeSlug = asTrimmedString(slug, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeSlug) {
    return NextResponse.json({ ok: false, error: 'invalid form slug' }, { status: 400 });
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const limited = consumeRateLimit(`website-form:${safeSlug}:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: 'too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(limited.retryAfterSec) },
      }
    );
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'payload too large' }, { status: 413 });
  }

  const raw = await request.json().catch(() => ({}));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 });
  }

  const body = raw as Record<string, unknown>;
  const sourcePayload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : body;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sourcePayload)) {
    const safeKey = asTrimmedString(key, 64).replace(/[^a-zA-Z0-9_.-]/g, '');
    if (!safeKey || safeKey === 'utm' || safeKey === 'landing_page' || safeKey === 'referrer') {
      continue;
    }
    if (typeof value === 'string') {
      sanitized[safeKey] = sanitizePlainText(value, 2000);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[safeKey] = value;
    } else if (value == null) {
      sanitized[safeKey] = null;
    } else {
      sanitized[safeKey] = sanitizePlainText(JSON.stringify(value), 2000);
    }
  }

  try {
    const result = await submitWebsiteForm({
      formSlug: safeSlug,
      payload: sanitized,
      utm: typeof body.utm === 'object' && body.utm ? (body.utm as Record<string, string>) : undefined,
      landing_page: sanitizePlainText(body.landing_page, 500) || undefined,
      referrer: sanitizePlainText(body.referrer || request.headers.get('referer'), 500) || null,
      user_agent: asTrimmedString(request.headers.get('user-agent'), 400) || null,
      ip,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'submit failed' },
      { status: 400 }
    );
  }
}
