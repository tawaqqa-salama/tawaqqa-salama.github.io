import { NextResponse } from 'next/server';
import { ingestInboundSocialMessage } from '@/lib/social/service';
import type { SocialPlatform } from '@/lib/social/types';

export const runtime = 'nodejs';

/** Internal/test + provider webhook forwarder for official inbound payloads. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    platform?: SocialPlatform;
    platformUserId?: string;
    contactName?: string;
    contactUsername?: string;
    phone?: string;
    email?: string;
    text?: string;
    platformMessageId?: string;
    threadId?: string;
    threadType?: 'message' | 'comment';
    accountId?: string;
  };

  if (!body.platform || !body.platformUserId || !body.text) {
    return NextResponse.json(
      { ok: false, error: 'platform, platformUserId, text مطلوبة' },
      { status: 400 }
    );
  }

  const result = await ingestInboundSocialMessage({
    platform: body.platform,
    platformUserId: body.platformUserId,
    contactName: body.contactName,
    contactUsername: body.contactUsername,
    phone: body.phone,
    email: body.email,
    text: body.text,
    platformMessageId: body.platformMessageId,
    threadId: body.threadId,
    threadType: body.threadType,
    accountId: body.accountId,
  });

  return NextResponse.json({
    ok: true,
    createdLead: result.client.createdLead,
    client: {
      id: result.client.id,
      client_code: result.client.client_code,
      lead_source: result.client.lead_source,
      source_channel: result.client.source_channel,
      pipeline_stage: result.client.pipeline_stage,
    },
    conversation: 'conversation' in result ? result.conversation : { id: result.conversationId },
  });
}
