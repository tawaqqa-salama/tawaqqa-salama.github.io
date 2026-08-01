import { NextResponse } from 'next/server';
import { sendWhatsAppNotification } from '@/lib/notifications/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      to?: string;
      message?: string;
      template?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.to || !body.message) {
      return NextResponse.json({ ok: false, error: 'to و message مطلوبان' }, { status: 400 });
    }

    const result = await sendWhatsAppNotification({
      to: body.to,
      message: body.message,
      template: body.template,
      metadata: body.metadata,
    });

    return NextResponse.json({ ok: result.ok, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'فشل الإشعار' },
      { status: 500 }
    );
  }
}
