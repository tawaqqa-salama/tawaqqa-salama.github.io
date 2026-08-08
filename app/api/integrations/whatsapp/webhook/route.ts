import { NextResponse } from 'next/server';
import { getWhatsAppEnvConfig } from '@/lib/whatsapp/config';
import { verifyMetaSignature } from '@/lib/whatsapp/crypto';
import { processWhatsAppWebhookBody } from '@/lib/whatsapp/inbound';
import { createWhatsAppProvider } from '@/lib/whatsapp/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Meta webhook verification (GET). Public — no session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const cfg = getWhatsAppEnvConfig();
  const expected = cfg.webhookVerifyToken;

  const result = createWhatsAppProvider().verifyWebhook({
    mode,
    verifyToken: token,
    challenge,
    expectedToken: expected,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: 'verification_failed' }, { status: 403 });
  }
  return new NextResponse(result.challenge ?? '', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/** Meta webhook events (POST). Validates signature when app secret is set. */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const cfg = getWhatsAppEnvConfig();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyMetaSignature(rawBody, signature, cfg.appSecret)) {
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const result = await processWhatsAppWebhookBody(body);
  // Always 200 to Meta after accepted validation to avoid endless retries on business errors
  return NextResponse.json({ ok: true, result });
}
