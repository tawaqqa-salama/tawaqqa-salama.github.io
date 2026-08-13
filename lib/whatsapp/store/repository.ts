/**
 * WhatsApp conversation/message repository.
 * CRM clients always go through crm-bridge. WA tables use Supabase when live,
 * memory store only for demo/tests (WHATSAPP_FORCE_MEMORY / no Supabase).
 */

import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isWhatsAppCrmMemoryMode } from '@/lib/whatsapp/crm-bridge';
import { getWhatsAppEnvConfig } from '@/lib/whatsapp/config';
import { memoryStore, getMemoryDb } from '@/lib/whatsapp/store/memory';
import type {
  CrmOpportunity,
  WhatsAppAccount,
  WhatsAppConversation,
  WhatsAppMessage,
} from '@/lib/whatsapp/types';

function shouldUseMemoryStore(): boolean {
  return isWhatsAppCrmMemoryMode() || !isSupabaseConfigured || isDemoMode;
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `wa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now() {
  return new Date().toISOString();
}

export const waRepository = {
  async ensureAccount(phoneNumberId: string): Promise<WhatsAppAccount> {
    const cfg = getWhatsAppEnvConfig();
    if (shouldUseMemoryStore()) {
      return memoryStore.ensureEnvAccount(phoneNumberId, {
        phone_number_id: phoneNumberId,
        waba_id: cfg.wabaId,
        business_name: 'توقع سلامة',
        provider: cfg.provider === 'stub' ? 'meta' : cfg.provider,
      });
    }

    const { data: existing } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('whatsapp_accounts')
        .update({ last_webhook_at: now(), updated_at: now() })
        .eq('id', existing.id);
      return existing as WhatsAppAccount;
    }

    // Never persist access token plaintext — env holds the secret
    const row: WhatsAppAccount = {
      id: uid(),
      business_name: 'توقع سلامة',
      phone_number: null,
      phone_number_id: phoneNumberId,
      waba_id: cfg.wabaId,
      access_token_encrypted: null,
      webhook_verify_token: null,
      status: 'active',
      provider: 'meta',
      last_webhook_at: now(),
      last_error: null,
      created_at: now(),
      updated_at: now(),
    };
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .insert([row])
      .select('*')
      .single();
    if (error) {
      // Table missing — soft fallback for inbox continuity in same process
      return memoryStore.ensureEnvAccount(phoneNumberId, row);
    }
    return data as WhatsAppAccount;
  },

  async findOrCreateConversation(input: {
    customerId: string;
    accountId: string | null;
    phone: string;
  }): Promise<WhatsAppConversation> {
    if (shouldUseMemoryStore()) {
      return memoryStore.findOrCreateConversation({
        customer_id: input.customerId,
        account_id: input.accountId,
        phone_number: input.phone,
      });
    }

    let q = supabase.from('whatsapp_conversations').select('*').eq('phone_number', input.phone);
    if (input.accountId) q = q.eq('whatsapp_account_id', input.accountId);
    const { data: rows } = await q.limit(1);
    const found = rows?.[0] as WhatsAppConversation | undefined;
    if (found) {
      const patch = {
        customer_id: input.customerId,
        status: found.status === 'closed' ? 'open' : found.status,
        updated_at: now(),
      };
      await supabase.from('whatsapp_conversations').update(patch).eq('id', found.id);
      return { ...found, ...patch };
    }

    const row = {
      id: uid(),
      customer_id: input.customerId,
      whatsapp_account_id: input.accountId,
      phone_number: input.phone,
      status: 'open',
      assigned_user_id: null,
      last_message_at: null,
      last_message_preview: null,
      unread_count: 0,
      service_window_expires_at: null,
      created_at: now(),
      updated_at: now(),
    };
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .insert([row])
      .select('*')
      .single();
    if (error) {
      return memoryStore.findOrCreateConversation({
        customer_id: input.customerId,
        account_id: input.accountId,
        phone_number: input.phone,
      });
    }
    return data as WhatsAppConversation;
  },

  async insertMessage(
    input: Omit<WhatsAppMessage, 'id' | 'created_at'> & { id?: string }
  ): Promise<{ message: WhatsAppMessage; duplicate: boolean }> {
    if (shouldUseMemoryStore()) {
      return memoryStore.insertMessage(input);
    }

    if (input.whatsapp_message_id) {
      const { data: existing } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('whatsapp_message_id', input.whatsapp_message_id)
        .maybeSingle();
      if (existing) return { message: existing as WhatsAppMessage, duplicate: true };
    }

    const message: WhatsAppMessage = {
      id: input.id || uid(),
      conversation_id: input.conversation_id,
      whatsapp_message_id: input.whatsapp_message_id,
      direction: input.direction,
      message_type: input.message_type,
      text: input.text,
      media_url: input.media_url,
      media_storage_path: input.media_storage_path,
      media_type: input.media_type,
      caption: input.caption,
      template_name: input.template_name,
      interactive_payload: input.interactive_payload,
      sent_by_user_id: input.sent_by_user_id,
      status: input.status,
      error_code: input.error_code,
      error_message: input.error_message,
      retry_count: input.retry_count,
      timestamp: input.timestamp,
      raw_payload: input.raw_payload,
      created_at: now(),
    };

    const { error } = await supabase.from('whatsapp_messages').insert([message]);
    if (error) {
      return memoryStore.insertMessage(input);
    }

    const preview = (message.text || message.caption || message.message_type || '').slice(0, 160);
    const convPatch: Record<string, unknown> = {
      last_message_at: message.timestamp,
      last_message_preview: preview,
      updated_at: now(),
    };
    if (message.direction === 'inbound') {
      const expires = new Date(message.timestamp);
      expires.setHours(expires.getHours() + 24);
      convPatch.service_window_expires_at = expires.toISOString();
      // increment unread via read-modify
      const { data: conv } = await supabase
        .from('whatsapp_conversations')
        .select('unread_count')
        .eq('id', message.conversation_id)
        .maybeSingle();
      convPatch.unread_count = Number(conv?.unread_count || 0) + 1;
    }
    await supabase
      .from('whatsapp_conversations')
      .update(convPatch)
      .eq('id', message.conversation_id);

    return { message, duplicate: false };
  },

  async updateMessageStatus(
    providerId: string,
    status: WhatsAppMessage['status'],
    error?: { code?: string | null; message?: string | null }
  ): Promise<WhatsAppMessage | null> {
    if (shouldUseMemoryStore()) {
      return memoryStore.updateMessageStatus(providerId, status, error);
    }
    const patch: Record<string, unknown> = { status };
    if (error?.code) patch.error_code = error.code;
    if (error?.message) patch.error_message = error.message;
    const { data } = await supabase
      .from('whatsapp_messages')
      .update(patch)
      .eq('whatsapp_message_id', providerId)
      .select('*')
      .maybeSingle();
    return (data as WhatsAppMessage) || null;
  },

  async listConversations(filter?: {
    status?: string;
    unassigned?: boolean;
    companyId?: string | null;
  }): Promise<WhatsAppConversation[]> {
    if (shouldUseMemoryStore()) return memoryStore.listConversations(filter);
    if (!filter?.companyId) return [];
    let q = supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('company_id', filter.companyId)
      .order('last_message_at', { ascending: false });
    if (filter?.status) q = q.eq('status', filter.status);
    if (filter?.unassigned) q = q.is('assigned_user_id', null);
    const { data, error } = await q;
    if (error) return memoryStore.listConversations(filter);
    return (data || []) as WhatsAppConversation[];
  },

  async getConversation(
    id: string,
    companyId?: string | null
  ): Promise<WhatsAppConversation | null> {
    if (shouldUseMemoryStore()) return memoryStore.getConversation(id, companyId);
    if (!companyId) return null;
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) return memoryStore.getConversation(id, companyId);
    return (data as WhatsAppConversation) || null;
  },

  async listMessages(conversationId: string): Promise<WhatsAppMessage[]> {
    if (shouldUseMemoryStore()) return memoryStore.listMessages(conversationId);
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });
    if (error) return memoryStore.listMessages(conversationId);
    return (data || []) as WhatsAppMessage[];
  },

  async markRead(conversationId: string, companyId?: string | null): Promise<void> {
    if (shouldUseMemoryStore()) {
      memoryStore.markConversationRead(conversationId);
      return;
    }
    if (!companyId) return;
    await supabase
      .from('whatsapp_conversations')
      .update({ unread_count: 0, updated_at: now() })
      .eq('id', conversationId)
      .eq('company_id', companyId);
  },

  async updateConversation(
    id: string,
    patch: Partial<WhatsAppConversation>,
    companyId?: string | null
  ): Promise<WhatsAppConversation | null> {
    if (shouldUseMemoryStore()) return memoryStore.updateConversation(id, patch);
    if (!companyId) return null;
    const { data } = await supabase
      .from('whatsapp_conversations')
      .update({ ...patch, updated_at: now() })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .maybeSingle();
    return (data as WhatsAppConversation) || null;
  },

  async createOpportunity(input: {
    customer_id: string;
    conversation_id?: string | null;
    service?: string | null;
    estimated_value?: number | null;
    probability?: number | null;
    expected_close_date?: string | null;
    title?: string | null;
    assigned_user_id?: string | null;
    notes?: string | null;
  }): Promise<CrmOpportunity> {
    if (shouldUseMemoryStore()) return memoryStore.createOpportunity(input);

    if (input.conversation_id) {
      const { data: existing } = await supabase
        .from('crm_opportunities')
        .select('*')
        .eq('conversation_id', input.conversation_id)
        .eq('status', 'open')
        .eq('source', 'WhatsApp')
        .maybeSingle();
      if (existing) return existing as CrmOpportunity;
    }

    const row = {
      id: uid(),
      customer_id: input.customer_id,
      conversation_id: input.conversation_id || null,
      title: input.title || 'فرصة من واتساب',
      service: input.service || null,
      estimated_value: input.estimated_value ?? null,
      probability: input.probability ?? null,
      expected_close_date: input.expected_close_date || null,
      source: 'WhatsApp',
      status: 'open',
      assigned_user_id: input.assigned_user_id || null,
      notes: input.notes || null,
      created_at: now(),
      updated_at: now(),
    };
    const { data, error } = await supabase
      .from('crm_opportunities')
      .insert([row])
      .select('*')
      .single();
    if (error) return memoryStore.createOpportunity(input);
    return data as CrmOpportunity;
  },

  async listOpportunities(customerId?: string): Promise<CrmOpportunity[]> {
    if (shouldUseMemoryStore()) return memoryStore.listOpportunities(customerId);
    let q = supabase.from('crm_opportunities').select('*').order('created_at', { ascending: false });
    if (customerId) q = q.eq('customer_id', customerId);
    const { data, error } = await q;
    if (error) return memoryStore.listOpportunities(customerId);
    return (data || []) as CrmOpportunity[];
  },

  async addAttachment(input: {
    customer_id: string;
    conversation_id?: string | null;
    message_id?: string | null;
    file_name?: string | null;
    media_type?: string | null;
    storage_path?: string | null;
    media_url?: string | null;
    size_bytes?: number | null;
  }) {
    if (shouldUseMemoryStore()) return memoryStore.addAttachment(input);
    const row = { id: uid(), ...input, created_at: now() };
    const { data, error } = await supabase
      .from('whatsapp_attachments')
      .insert([row])
      .select('*')
      .single();
    if (error) return memoryStore.addAttachment(input);
    return data;
  },

  async listAttachments(customerId: string) {
    if (shouldUseMemoryStore()) return memoryStore.listAttachments(customerId);
    const { data, error } = await supabase
      .from('whatsapp_attachments')
      .select('*')
      .eq('customer_id', customerId);
    if (error) return memoryStore.listAttachments(customerId);
    return data || [];
  },

  async saveExtraction(input: {
    conversation_id: string;
    customer_id?: string | null;
    message_id?: string | null;
    proposed: Record<string, unknown>;
  }) {
    if (shouldUseMemoryStore()) return memoryStore.saveExtraction(input);
    const row = {
      id: uid(),
      conversation_id: input.conversation_id,
      customer_id: input.customer_id || null,
      message_id: input.message_id || null,
      proposed: input.proposed,
      status: 'pending',
      created_at: now(),
      updated_at: now(),
    };
    const { data, error } = await supabase
      .from('whatsapp_lead_extractions')
      .insert([row])
      .select('*')
      .single();
    if (error) return memoryStore.saveExtraction(input);
    return data;
  },

  async listExtractions(conversationId: string) {
    if (shouldUseMemoryStore()) return memoryStore.listExtractions(conversationId);
    const { data, error } = await supabase
      .from('whatsapp_lead_extractions')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });
    if (error) return memoryStore.listExtractions(conversationId);
    return data || [];
  },

  async reviewExtraction(
    id: string,
    status: 'pending' | 'confirmed' | 'edited' | 'ignored',
    proposed?: Record<string, unknown>,
    reviewer?: string | null
  ) {
    if (shouldUseMemoryStore()) return memoryStore.reviewExtraction(id, status, proposed, reviewer);
    const patch: Record<string, unknown> = {
      status,
      reviewed_by: reviewer || null,
      updated_at: now(),
    };
    if (proposed) patch.proposed = proposed;
    const { data } = await supabase
      .from('whatsapp_lead_extractions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    return data;
  },

  async addNotification(input: {
    user_id: string | null;
    conversation_id: string | null;
    customer_id: string | null;
    title: string;
    body: string | null;
  }) {
    if (shouldUseMemoryStore()) return memoryStore.addNotification(input);
    const row = { id: uid(), ...input, read_at: null, created_at: now() };
    await supabase.from('whatsapp_notifications').insert([row]);
    return row;
  },

  resolvePhoneNumberId(accountId: string | null): string | null {
    if (!accountId) return getWhatsAppEnvConfig().phoneNumberId;
    if (shouldUseMemoryStore()) {
      const acc = getMemoryDb().accounts.find((a) => a.id === accountId);
      return acc?.phone_number_id || getWhatsAppEnvConfig().phoneNumberId;
    }
    return getWhatsAppEnvConfig().phoneNumberId;
  },
};
