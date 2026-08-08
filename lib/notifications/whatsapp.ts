import { normalizeWhatsAppPhone } from '@/lib/whatsapp/phone';
import { createWhatsAppProvider } from '@/lib/whatsapp/provider';

export type WhatsAppNotifyPayload = {
  to: string;
  template?: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type WhatsAppNotifyResult = {
  ok: boolean;
  provider: 'stub' | 'webhook' | 'meta';
  messageId?: string;
  error?: string;
  /** true when stub accepted the payload without external send */
  stubbed?: boolean;
};

/**
 * إرسال إشعار واتساب:
 * 1) Cloud API (Meta) عند ضبط WHATSAPP_ACCESS_TOKEN + PHONE_NUMBER_ID
 * 2) وإلا Webhook خارجي WHATSAPP_WEBHOOK_URL
 * 3) وإلا stub آمن
 */
export async function sendWhatsAppNotification(
  payload: WhatsAppNotifyPayload
): Promise<WhatsAppNotifyResult> {
  const phone = normalizeWhatsAppPhone(payload.to);
  if (!phone || !/^\+9665\d{8}$/.test(phone)) {
    return { ok: false, provider: 'stub', error: 'رقم جوال غير صالح' };
  }

  const cloud = createWhatsAppProvider();
  if (cloud.id === 'meta') {
    if (payload.template) {
      const result = await cloud.sendTemplate({
        to: phone,
        templateName: payload.template,
        language: 'ar',
      });
      return {
        ok: result.ok,
        provider: 'meta',
        messageId: result.providerMessageId,
        error: result.errorMessage,
        stubbed: result.stubbed,
      };
    }
    const result = await cloud.sendText({ to: phone, text: payload.message });
    return {
      ok: result.ok,
      provider: 'meta',
      messageId: result.providerMessageId,
      error: result.errorMessage,
      stubbed: result.stubbed,
    };
  }

  const webhook = process.env.WHATSAPP_WEBHOOK_URL || process.env.NEXT_PUBLIC_WHATSAPP_WEBHOOK_URL;
  if (!webhook) {
    const stub = await createWhatsAppProvider('stub').sendText({
      to: phone,
      text: payload.message,
    });
    return {
      ok: true,
      provider: 'stub',
      messageId: stub.providerMessageId || `stub-${Date.now()}`,
      stubbed: true,
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
