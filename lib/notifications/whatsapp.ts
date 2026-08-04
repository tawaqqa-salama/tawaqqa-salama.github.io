export type WhatsAppNotifyPayload = {
  to: string;
  template?: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type WhatsAppNotifyResult = {
  ok: boolean;
  provider: 'stub' | 'webhook';
  messageId?: string;
  error?: string;
  /** true when stub accepted the payload without external send */
  stubbed?: boolean;
};

/**
 * إرسال إشعار واتساب عبر Webhook خارجي إن وُجدت متغيرات البيئة،
 * وإلا يُسجَّل كـ stub آمن دون إرسال خارجي.
 */
export async function sendWhatsAppNotification(
  payload: WhatsAppNotifyPayload
): Promise<WhatsAppNotifyResult> {
  const phone = payload.to.replace(/\s+/g, '');
  if (!/^(\+966|966|05)\d{8,9}$/.test(phone)) {
    return { ok: false, provider: 'stub', error: 'رقم جوال غير صالح' };
  }

  const webhook = process.env.WHATSAPP_WEBHOOK_URL || process.env.NEXT_PUBLIC_WHATSAPP_WEBHOOK_URL;
  if (!webhook) {
    return {
      ok: true,
      provider: 'stub',
      messageId: `stub-${Date.now()}`,
      stubbed: true,
      error: undefined,
    };
  }

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.WHATSAPP_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.WHATSAPP_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        to: phone,
        template: payload.template || 'tawaqqa_notify',
        message: payload.message,
        metadata: payload.metadata || {},
      }),
    });
    if (!res.ok) {
      return { ok: false, provider: 'webhook', error: `Webhook HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, provider: 'webhook', messageId: data.id || `wa-${Date.now()}` };
  } catch (error) {
    return {
      ok: false,
      provider: 'webhook',
      error: error instanceof Error ? error.message : 'فشل الإرسال',
    };
  }
}
