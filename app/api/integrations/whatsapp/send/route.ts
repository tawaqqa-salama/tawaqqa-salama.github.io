import { NextResponse } from 'next/server';
import { sendOutboundMessage } from '@/lib/whatsapp/outbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      conversationId?: string;
      userId?: string;
      kind?: 'text' | 'template' | 'image' | 'document';
      text?: string;
      templateName?: string;
      templateLanguage?: string;
      templateComponents?: unknown[];
      mediaUrl?: string;
      caption?: string;
      filename?: string;
      retryMessageId?: string;
    };

    if (!body.conversationId) {
      return NextResponse.json({ ok: false, error: 'conversationId_required' }, { status: 400 });
    }

    const result = await sendOutboundMessage({
      conversationId: body.conversationId,
      userId: body.userId,
      kind: body.kind || (body.templateName ? 'template' : 'text'),
      text: body.text,
      templateName: body.templateName,
      templateLanguage: body.templateLanguage,
      templateComponents: body.templateComponents,
      mediaUrl: body.mediaUrl,
      caption: body.caption,
      filename: body.filename,
      forceRetryMessageId: body.retryMessageId,
    });

    return NextResponse.json({
      ok: result.ok,
      message: result.message,
      error: result.error || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'send_error';
    const status = msg === 'service_window_closed_use_template' ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
