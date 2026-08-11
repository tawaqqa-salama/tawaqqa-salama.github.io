import { createWhatsAppProvider } from '@/lib/whatsapp/provider';
import { requiresTemplate } from '@/lib/whatsapp/service-window';
import { waRepository } from '@/lib/whatsapp/store/repository';
import type { WhatsAppMessage } from '@/lib/whatsapp/types';

const MAX_RETRY = 3;

export type OutboundSendInput = {
  conversationId: string;
  /** Session tenant — required for cross-tenant IDOR prevention */
  companyId?: string | null;
  userId?: string | null;
  kind: 'text' | 'template' | 'image' | 'document';
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
  mediaUrl?: string;
  caption?: string;
  filename?: string;
  forceRetryMessageId?: string;
};

export async function sendOutboundMessage(input: OutboundSendInput): Promise<{
  ok: boolean;
  message: WhatsAppMessage;
  error?: string;
}> {
  const conversation = await waRepository.getConversation(
    input.conversationId,
    input.companyId
  );
  if (!conversation) {
    throw new Error('conversation_not_found');
  }

  if (input.kind === 'text' && requiresTemplate(conversation)) {
    throw new Error('service_window_closed_use_template');
  }

  let message: WhatsAppMessage;
  if (input.forceRetryMessageId) {
    const existing = (await waRepository.listMessages(input.conversationId)).find(
      (m) => m.id === input.forceRetryMessageId
    );
    if (!existing) throw new Error('message_not_found');
    if (existing.retry_count >= MAX_RETRY) {
      return { ok: false, message: existing, error: 'max_retries' };
    }
    existing.retry_count += 1;
    existing.status = 'queued';
    existing.error_code = null;
    existing.error_message = null;
    message = existing;
  } else {
    const inserted = await waRepository.insertMessage({
      conversation_id: input.conversationId,
      whatsapp_message_id: null,
      direction: 'outbound',
      message_type: input.kind,
      text: input.text || input.caption || null,
      media_url: input.mediaUrl || null,
      media_storage_path: null,
      media_type: input.kind === 'image' || input.kind === 'document' ? input.kind : null,
      caption: input.caption || null,
      template_name: input.templateName || null,
      interactive_payload: null,
      sent_by_user_id: input.userId || null,
      status: 'queued',
      error_code: null,
      error_message: null,
      retry_count: 0,
      timestamp: new Date().toISOString(),
      raw_payload: null,
    });
    message = inserted.message;
  }

  const provider = createWhatsAppProvider();
  const phoneNumberId = waRepository.resolvePhoneNumberId(conversation.whatsapp_account_id);

  let result;
  try {
    if (input.kind === 'template' || message.template_name) {
      result = await provider.sendTemplate({
        to: conversation.phone_number,
        templateName: input.templateName || message.template_name || 'welcome',
        language: input.templateLanguage || 'ar',
        components: input.templateComponents,
        phoneNumberId: phoneNumberId || undefined,
      });
    } else if (input.kind === 'image' || message.message_type === 'image') {
      result = await provider.sendImage({
        to: conversation.phone_number,
        kind: 'image',
        link: input.mediaUrl || message.media_url || undefined,
        caption: input.caption || message.caption || undefined,
        phoneNumberId: phoneNumberId || undefined,
      });
    } else if (input.kind === 'document' || message.message_type === 'document') {
      result = await provider.sendDocument({
        to: conversation.phone_number,
        kind: 'document',
        link: input.mediaUrl || message.media_url || undefined,
        caption: input.caption || message.caption || undefined,
        filename: input.filename,
        phoneNumberId: phoneNumberId || undefined,
      });
    } else {
      result = await provider.sendText({
        to: conversation.phone_number,
        text: input.text || message.text || '',
        phoneNumberId: phoneNumberId || undefined,
      });
    }
  } catch (e) {
    message.status = 'failed';
    message.error_code = 'SEND_EXCEPTION';
    message.error_message = e instanceof Error ? e.message : 'send_failed';
    if (message.whatsapp_message_id) {
      await waRepository.updateMessageStatus(message.whatsapp_message_id, 'failed', {
        code: message.error_code,
        message: message.error_message,
      });
    }
    return { ok: false, message, error: message.error_message };
  }

  if (!result.ok) {
    message.status = 'failed';
    message.error_code = result.errorCode || 'SEND_FAILED';
    message.error_message = result.errorMessage || 'send_failed';
    if (result.providerMessageId) {
      message.whatsapp_message_id = result.providerMessageId;
      await waRepository.updateMessageStatus(result.providerMessageId, 'failed', {
        code: message.error_code,
        message: message.error_message,
      });
    }
    return { ok: false, message, error: message.error_message || undefined };
  }

  message.status = 'sent';
  message.whatsapp_message_id = result.providerMessageId || message.whatsapp_message_id;
  message.raw_payload = result.raw || { stubbed: result.stubbed };
  return { ok: true, message };
}
