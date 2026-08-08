import { getWhatsAppEnvConfig } from '@/lib/whatsapp/config';
import { extractLeadFields } from '@/lib/whatsapp/lead-extract';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/phone';
import { createWhatsAppProvider } from '@/lib/whatsapp/provider';
import { memoryStore } from '@/lib/whatsapp/store/memory';
import {
  syncClientRow,
  syncContact,
  syncConversation,
  syncMessage,
} from '@/lib/whatsapp/store/supabase-sync';
import type { InboundParsedMessage, InboundStatusUpdate, WhatsAppMessage } from '@/lib/whatsapp/types';
import { parseMetaWebhookPayload } from '@/lib/whatsapp/webhook-parse';

export type InboundProcessResult = {
  ok: boolean;
  processedMessages: number;
  duplicates: number;
  createdLeads: number;
  statusUpdates: number;
  errors: string[];
};

function ensureAccount(phoneNumberId: string) {
  const cfg = getWhatsAppEnvConfig();
  return memoryStore.ensureEnvAccount(phoneNumberId, {
    phone_number_id: phoneNumberId,
    waba_id: cfg.wabaId,
    business_name: 'توقع سلامة',
    provider: cfg.provider === 'stub' ? 'meta' : cfg.provider,
  });
}

async function persistMediaIfNeeded(
  msg: InboundParsedMessage,
  customerId: string,
  conversationId: string,
  messageId: string
) {
  if (!msg.mediaId) return;
  const provider = createWhatsAppProvider();
  const media = await provider.getMedia(msg.mediaId);
  const mediaUrl = media.url || `whatsapp-media://${msg.mediaId}`;
  memoryStore.addAttachment({
    customer_id: customerId,
    conversation_id: conversationId,
    message_id: messageId,
    file_name: msg.caption || msg.mediaId,
    media_type: msg.mediaMimeType || msg.type,
    media_url: mediaUrl,
    storage_path: null,
  });
  return mediaUrl;
}

export async function processInboundMessage(
  msg: InboundParsedMessage
): Promise<{
  duplicate: boolean;
  createdLead: boolean;
  message: WhatsAppMessage;
  conversationId: string;
  customerId: string;
}> {
  const phone = normalizeWhatsAppPhone(msg.from);
  if (!phone) {
    throw new Error('invalid_phone');
  }

  const account = ensureAccount(msg.phoneNumberId);
  memoryStore.touchAccountWebhook(account.id);

  let createdLead = false;
  let client = memoryStore.findClientByPhone(phone);
  if (!client) {
    client = memoryStore.createLeadFromWhatsApp({
      phone,
      profileName: msg.profileName,
    });
    createdLead = true;
  } else {
    memoryStore.upsertContact({
      customer_id: client.id,
      phone_number: phone,
      profile_name: msg.profileName,
    });
    memoryStore.updateClient(client.id, {
      last_contact_date: msg.timestamp.slice(0, 10),
      whatsapp_profile_name: msg.profileName || client.whatsapp_profile_name,
    });
  }

  const conversation = memoryStore.findOrCreateConversation({
    customer_id: client.id,
    account_id: account.id,
    phone_number: phone,
  });

  const { message, duplicate } = memoryStore.insertMessage({
    conversation_id: conversation.id,
    whatsapp_message_id: msg.providerMessageId,
    direction: 'inbound',
    message_type: msg.type,
    text: msg.text || null,
    media_url: null,
    media_storage_path: null,
    media_type: msg.mediaMimeType || null,
    caption: msg.caption || null,
    template_name: null,
    interactive_payload: msg.interactive,
    sent_by_user_id: null,
    status: 'received',
    error_code: null,
    error_message: null,
    retry_count: 0,
    timestamp: msg.timestamp,
    raw_payload: msg.raw,
  });

  if (!duplicate) {
    const mediaUrl = await persistMediaIfNeeded(msg, client.id, conversation.id, message.id);
    if (mediaUrl) {
      message.media_url = mediaUrl;
    }

    // Notify assignee or unassigned inbox
    memoryStore.addNotification({
      user_id: conversation.assigned_user_id,
      conversation_id: conversation.id,
      customer_id: client.id,
      title: createdLead ? 'عميل محتمل جديد من واتساب' : 'رسالة واتساب جديدة',
      body: (msg.text || msg.caption || msg.type || '').slice(0, 200),
    });

    if (msg.text) {
      const extracted = await extractLeadFields(msg.text);
      if (extracted && (extracted.activity || extracted.city || extracted.area || extracted.requested_service)) {
        memoryStore.saveExtraction({
          conversation_id: conversation.id,
          customer_id: client.id,
          message_id: message.id,
          proposed: extracted,
        });
      }
    }

    // Durable mirror (when Supabase + 031 schema available)
    const contact = memoryStore.findContactByPhone(phone);
    await Promise.all([
      syncClientRow(client),
      contact ? syncContact(contact) : Promise.resolve(),
      syncConversation(conversation),
      syncMessage(message),
    ]);

    // mark read at provider (best effort)
    void createWhatsAppProvider().markAsRead(msg.providerMessageId, msg.phoneNumberId);
  }

  return {
    duplicate,
    createdLead,
    message,
    conversationId: conversation.id,
    customerId: client.id,
  };
}

export function processStatusUpdate(update: InboundStatusUpdate): boolean {
  const mapped =
    update.status === 'failed'
      ? 'failed'
      : update.status === 'read'
        ? 'read'
        : update.status === 'delivered'
          ? 'delivered'
          : 'sent';
  const msg = memoryStore.updateMessageStatus(update.providerMessageId, mapped, {
    code: update.errorCode,
    message: update.errorMessage,
  });
  return Boolean(msg);
}

export async function processWhatsAppWebhookBody(body: unknown): Promise<InboundProcessResult> {
  const { messages, statuses } = parseMetaWebhookPayload(body);
  const result: InboundProcessResult = {
    ok: true,
    processedMessages: 0,
    duplicates: 0,
    createdLeads: 0,
    statusUpdates: 0,
    errors: [],
  };

  for (const msg of messages) {
    try {
      const r = await processInboundMessage(msg);
      if (r.duplicate) result.duplicates += 1;
      else {
        result.processedMessages += 1;
        if (r.createdLead) result.createdLeads += 1;
      }
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : 'inbound_error');
    }
  }

  for (const st of statuses) {
    if (processStatusUpdate(st)) result.statusUpdates += 1;
  }

  return result;
}
