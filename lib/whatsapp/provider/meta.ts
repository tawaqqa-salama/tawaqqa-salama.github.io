import { getWhatsAppEnvConfig } from '@/lib/whatsapp/config';
import type {
  ProviderMediaResult,
  ProviderSendResult,
  SendMediaInput,
  SendTemplateInput,
  SendTextInput,
  WhatsAppProvider,
} from '@/lib/whatsapp/provider/types';

async function graphPost(
  path: string,
  body: Record<string, unknown>,
  token: string,
  base: string
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const res = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data, status: res.status };
}

function extractError(data: Record<string, unknown>): { code?: string; message?: string } {
  const err = data.error as { code?: number | string; message?: string } | undefined;
  if (!err) return {};
  return {
    code: err.code != null ? String(err.code) : undefined,
    message: err.message,
  };
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly id = 'meta';

  private cfg() {
    return getWhatsAppEnvConfig();
  }

  private phoneId(override?: string) {
    return override || this.cfg().phoneNumberId;
  }

  private token() {
    return this.cfg().accessToken;
  }

  async sendText(input: SendTextInput): Promise<ProviderSendResult> {
    const cfg = this.cfg();
    const phoneId = this.phoneId(input.phoneNumberId);
    const token = this.token();
    if (!phoneId || !token) {
      return { ok: false, errorCode: 'NOT_CONFIGURED', errorMessage: 'WhatsApp Cloud API not configured' };
    }
    const { ok, data } = await graphPost(
      `${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to.replace(/^\+/, ''),
        type: 'text',
        text: { preview_url: false, body: input.text },
      },
      token,
      cfg.graphBase
    );
    if (!ok) {
      const e = extractError(data);
      return { ok: false, errorCode: e.code, errorMessage: e.message || 'send_failed', raw: data };
    }
    const messages = data.messages as Array<{ id?: string }> | undefined;
    return { ok: true, providerMessageId: messages?.[0]?.id, raw: data };
  }

  async sendTemplate(input: SendTemplateInput): Promise<ProviderSendResult> {
    const cfg = this.cfg();
    const phoneId = this.phoneId(input.phoneNumberId);
    const token = this.token();
    if (!phoneId || !token) {
      return { ok: false, errorCode: 'NOT_CONFIGURED', errorMessage: 'WhatsApp Cloud API not configured' };
    }
    const { ok, data } = await graphPost(
      `${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: input.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: input.language || 'ar' },
          components: input.components || [],
        },
      },
      token,
      cfg.graphBase
    );
    if (!ok) {
      const e = extractError(data);
      return { ok: false, errorCode: e.code, errorMessage: e.message || 'template_failed', raw: data };
    }
    const messages = data.messages as Array<{ id?: string }> | undefined;
    return { ok: true, providerMessageId: messages?.[0]?.id, raw: data };
  }

  async sendImage(input: SendMediaInput): Promise<ProviderSendResult> {
    return this.sendMedia('image', input);
  }

  async sendDocument(input: SendMediaInput): Promise<ProviderSendResult> {
    return this.sendMedia('document', input);
  }

  private async sendMedia(
    type: 'image' | 'document' | 'audio' | 'video',
    input: SendMediaInput
  ): Promise<ProviderSendResult> {
    const cfg = this.cfg();
    const phoneId = this.phoneId(input.phoneNumberId);
    const token = this.token();
    if (!phoneId || !token) {
      return { ok: false, errorCode: 'NOT_CONFIGURED', errorMessage: 'WhatsApp Cloud API not configured' };
    }
    const mediaBody: Record<string, unknown> = {};
    if (input.mediaId) mediaBody.id = input.mediaId;
    else if (input.link) mediaBody.link = input.link;
    if (input.caption) mediaBody.caption = input.caption;
    if (input.filename && type === 'document') mediaBody.filename = input.filename;

    const { ok, data } = await graphPost(
      `${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: input.to.replace(/^\+/, ''),
        type,
        [type]: mediaBody,
      },
      token,
      cfg.graphBase
    );
    if (!ok) {
      const e = extractError(data);
      return { ok: false, errorCode: e.code, errorMessage: e.message || 'media_failed', raw: data };
    }
    const messages = data.messages as Array<{ id?: string }> | undefined;
    return { ok: true, providerMessageId: messages?.[0]?.id, raw: data };
  }

  async sendMessage(input: {
    to: string;
    type: string;
    payload: Record<string, unknown>;
    phoneNumberId?: string;
  }): Promise<ProviderSendResult> {
    const cfg = this.cfg();
    const phoneId = this.phoneId(input.phoneNumberId);
    const token = this.token();
    if (!phoneId || !token) {
      return { ok: false, errorCode: 'NOT_CONFIGURED', errorMessage: 'WhatsApp Cloud API not configured' };
    }
    const { ok, data } = await graphPost(
      `${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: input.to.replace(/^\+/, ''),
        type: input.type,
        ...input.payload,
      },
      token,
      cfg.graphBase
    );
    if (!ok) {
      const e = extractError(data);
      return { ok: false, errorCode: e.code, errorMessage: e.message || 'send_failed', raw: data };
    }
    const messages = data.messages as Array<{ id?: string }> | undefined;
    return { ok: true, providerMessageId: messages?.[0]?.id, raw: data };
  }

  async getMedia(mediaId: string): Promise<ProviderMediaResult> {
    const cfg = this.cfg();
    const token = this.token();
    if (!token) return { ok: false, errorMessage: 'NOT_CONFIGURED' };
    const metaRes = await fetch(`${cfg.graphBase}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meta = (await metaRes.json().catch(() => ({}))) as {
      url?: string;
      mime_type?: string;
      error?: { message?: string };
    };
    if (!metaRes.ok || !meta.url) {
      return { ok: false, errorMessage: meta.error?.message || 'media_lookup_failed' };
    }
    return { ok: true, url: meta.url, mimeType: meta.mime_type };
  }

  async markAsRead(providerMessageId: string, phoneNumberId?: string): Promise<{ ok: boolean }> {
    const cfg = this.cfg();
    const phoneId = this.phoneId(phoneNumberId);
    const token = this.token();
    if (!phoneId || !token) return { ok: false };
    const { ok } = await graphPost(
      `${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: providerMessageId,
      },
      token,
      cfg.graphBase
    );
    return { ok };
  }

  verifyWebhook(params: {
    mode: string | null;
    verifyToken: string | null;
    challenge: string | null;
    expectedToken: string | null;
  }): { ok: boolean; challenge?: string } {
    if (params.mode !== 'subscribe') return { ok: false };
    if (!params.expectedToken || params.verifyToken !== params.expectedToken) {
      return { ok: false };
    }
    return { ok: true, challenge: params.challenge || '' };
  }

  async testConnection(): Promise<{ ok: boolean; detail?: string }> {
    const cfg = this.cfg();
    if (!cfg.phoneNumberId || !cfg.accessToken) {
      return { ok: false, detail: 'missing_credentials' };
    }
    const res = await fetch(`${cfg.graphBase}/${cfg.phoneNumberId}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });
    if (!res.ok) {
      return { ok: false, detail: `http_${res.status}` };
    }
    const data = (await res.json()) as { display_phone_number?: string; verified_name?: string };
    return {
      ok: true,
      detail: data.display_phone_number || data.verified_name || 'connected',
    };
  }
}
