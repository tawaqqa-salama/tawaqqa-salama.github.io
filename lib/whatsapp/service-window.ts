import type { WhatsAppConversation } from '@/lib/whatsapp/types';

/** WhatsApp Cloud API: free-form replies only within 24h of last customer message. */
export function isWithinCustomerServiceWindow(
  conversation: Pick<WhatsAppConversation, 'service_window_expires_at'> | null | undefined,
  at: Date = new Date()
): boolean {
  if (!conversation?.service_window_expires_at) return false;
  return new Date(conversation.service_window_expires_at).getTime() > at.getTime();
}

export function requiresTemplate(
  conversation: Pick<WhatsAppConversation, 'service_window_expires_at'> | null | undefined,
  at: Date = new Date()
): boolean {
  return !isWithinCustomerServiceWindow(conversation, at);
}
