import type { InboundParsedMessage, InboundStatusUpdate } from '@/lib/whatsapp/types';

type MetaChange = {
  value?: {
    metadata?: { phone_number_id?: string };
    contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
    messages?: Array<Record<string, unknown>>;
    statuses?: Array<Record<string, unknown>>;
  };
};

/** Parse Meta Cloud API webhook payload into normalized inbound events. */
export function parseMetaWebhookPayload(body: unknown): {
  messages: InboundParsedMessage[];
  statuses: InboundStatusUpdate[];
} {
  const messages: InboundParsedMessage[] = [];
  const statuses: InboundStatusUpdate[] = [];
  const root = body as {
    object?: string;
    entry?: Array<{ changes?: MetaChange[] }>;
  };

  for (const entry of root.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;
      const phoneNumberId = value.metadata?.phone_number_id || '';
      const profileName = value.contacts?.[0]?.profile?.name || null;

      for (const msg of value.messages || []) {
        const from = String(msg.from || '');
        const id = String(msg.id || '');
        const timestampSec = String(msg.timestamp || Math.floor(Date.now() / 1000));
        const timestamp = new Date(Number(timestampSec) * 1000).toISOString();
        const type = String(msg.type || 'text');

        let text: string | null = null;
        let caption: string | null = null;
        let mediaId: string | null = null;
        let mediaMimeType: string | null = null;
        let interactive: Record<string, unknown> | null = null;

        if (type === 'text') {
          text = String((msg.text as { body?: string } | undefined)?.body || '');
        } else if (type === 'image') {
          const image = msg.image as { id?: string; caption?: string; mime_type?: string };
          mediaId = image?.id || null;
          caption = image?.caption || null;
          mediaMimeType = image?.mime_type || null;
          text = caption;
        } else if (type === 'document') {
          const doc = msg.document as {
            id?: string;
            caption?: string;
            mime_type?: string;
            filename?: string;
          };
          mediaId = doc?.id || null;
          caption = doc?.caption || doc?.filename || null;
          mediaMimeType = doc?.mime_type || null;
          text = caption;
        } else if (type === 'audio' || type === 'video' || type === 'sticker') {
          const media = msg[type] as { id?: string; mime_type?: string };
          mediaId = media?.id || null;
          mediaMimeType = media?.mime_type || null;
        } else if (type === 'interactive') {
          const inter = msg.interactive as {
            type?: string;
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string; description?: string };
          };
          interactive = inter as Record<string, unknown>;
          text =
            inter?.button_reply?.title ||
            inter?.list_reply?.title ||
            inter?.type ||
            'interactive';
        } else if (type === 'button') {
          const button = msg.button as { text?: string; payload?: string };
          text = button?.text || button?.payload || 'button';
          interactive = button as Record<string, unknown>;
        }

        if (!id || !from || !phoneNumberId) continue;
        messages.push({
          providerMessageId: id,
          phoneNumberId,
          from,
          profileName,
          timestamp,
          type,
          text,
          caption,
          mediaId,
          mediaMimeType,
          interactive,
          raw: msg,
        });
      }

      for (const st of value.statuses || []) {
        const id = String(st.id || '');
        const status = String(st.status || '') as InboundStatusUpdate['status'];
        const timestampSec = String(st.timestamp || Math.floor(Date.now() / 1000));
        const errors = st.errors as Array<{ code?: number; title?: string; message?: string }> | undefined;
        if (!id || !['sent', 'delivered', 'read', 'failed'].includes(status)) continue;
        statuses.push({
          providerMessageId: id,
          status,
          timestamp: new Date(Number(timestampSec) * 1000).toISOString(),
          errorCode: errors?.[0]?.code != null ? String(errors[0].code) : null,
          errorMessage: errors?.[0]?.message || errors?.[0]?.title || null,
          raw: st,
        });
      }
    }
  }

  return { messages, statuses };
}
