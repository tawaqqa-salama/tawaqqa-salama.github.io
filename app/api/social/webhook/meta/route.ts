import { NextResponse } from 'next/server';
import { ingestInboundSocialMessage } from '@/lib/social/service';
import { verifyMetaSignature } from '@/lib/whatsapp/crypto';

export const runtime = 'nodejs';

/**
 * Meta webhook for Instagram/Facebook messaging (official).
 * Separate from WhatsApp Cloud webhook; validates X-Hub-Signature-256.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected =
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    '';
  if (mode === 'subscribe' && token && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const sig = request.headers.get('x-hub-signature-256');
  const secret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || '';
  if (!verifyMetaSignature(raw, sig, secret || null)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const objectType = String(body.object || '');
  const entries = (body.entry as Array<Record<string, unknown>>) || [];
  let ingested = 0;

  for (const entry of entries) {
    const messaging =
      (entry.messaging as Array<Record<string, unknown>>) ||
      ((entry.changes as Array<{ value?: Record<string, unknown> }>) || [])
        .map((c) => c.value)
        .filter(Boolean);

    for (const event of messaging) {
      if (!event) continue;
      const sender = (event.sender as { id?: string } | undefined)?.id;
      const message = event.message as { mid?: string; text?: string } | undefined;
      const text = message?.text;
      if (!sender || !text) continue;
      const platform = objectType.includes('instagram') ? 'instagram' : 'facebook';
      await ingestInboundSocialMessage({
        platform,
        platformUserId: sender,
        text,
        platformMessageId: message?.mid || null,
        threadType: 'message',
      });
      ingested++;
    }
  }

  return NextResponse.json({ ok: true, ingested });
}
