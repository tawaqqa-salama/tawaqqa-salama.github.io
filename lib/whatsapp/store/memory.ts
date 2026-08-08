import { normalizeWhatsAppPhone } from '@/lib/whatsapp/phone';
import type {
  CrmOpportunity,
  CustomerWhatsAppContact,
  LeadExtractionProposal,
  WhatsAppAccount,
  WhatsAppAutomation,
  WhatsAppCampaign,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppNotification,
  WhatsAppTemplate,
} from '@/lib/whatsapp/types';

export type WaCrmClient = {
  id: string;
  client_code: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  business_name: string | null;
  activity_type: string | null;
  city: string | null;
  district: string | null;
  street: string | null;
  region: string | null;
  building_area: number | null;
  floors_count: number | null;
  pipeline_stage: string;
  lead_status: string | null;
  lead_notes: string | null;
  lead_source: string | null;
  source_channel: string | null;
  first_contact_at: string | null;
  last_contact_date: string | null;
  whatsapp_profile_name: string | null;
  quotation_status: string | null;
  quotation_number: string | null;
  created_at: string;
  updated_at: string;
};

function uid(prefix = 'wa'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now() {
  return new Date().toISOString();
}

export type WhatsAppMemoryDb = {
  accounts: WhatsAppAccount[];
  contacts: CustomerWhatsAppContact[];
  conversations: WhatsAppConversation[];
  messages: WhatsAppMessage[];
  clients: WaCrmClient[];
  opportunities: CrmOpportunity[];
  templates: WhatsAppTemplate[];
  campaigns: WhatsAppCampaign[];
  automations: WhatsAppAutomation[];
  notifications: WhatsAppNotification[];
  extractions: LeadExtractionProposal[];
  attachments: Array<{
    id: string;
    customer_id: string;
    conversation_id: string | null;
    message_id: string | null;
    file_name: string | null;
    media_type: string | null;
    storage_path: string | null;
    media_url: string | null;
    size_bytes: number | null;
    created_at: string;
  }>;
  audit: Array<{
    id: string;
    action: string;
    entity: string;
    entity_id: string | null;
    actor_user_id: string | null;
    detail: Record<string, unknown>;
    created_at: string;
  }>;
  leadSeq: number;
};

const g = globalThis as unknown as { __tawaqWaDb?: WhatsAppMemoryDb };

export function getMemoryDb(): WhatsAppMemoryDb {
  if (!g.__tawaqWaDb) {
    g.__tawaqWaDb = {
      accounts: [],
      contacts: [],
      conversations: [],
      messages: [],
      clients: [],
      opportunities: [],
      templates: defaultTemplates(),
      campaigns: [],
      automations: [],
      notifications: [],
      extractions: [],
      attachments: [],
      audit: [],
      leadSeq: 1,
    };
  }
  return g.__tawaqWaDb;
}

export function resetMemoryDb() {
  g.__tawaqWaDb = undefined;
  return getMemoryDb();
}

function defaultTemplates(): WhatsAppTemplate[] {
  const t = now();
  const rows: Array<[string, string, string]> = [
    ['welcome', 'ترحيب', 'مرحباً {{1}}، شكراً لتواصلكم مع توقع سلامة.'],
    ['lead_followup', 'متابعة عميل', 'مرحباً {{1}}، نود متابعة طلبكم بخصوص {{2}}.'],
    ['quote_reminder', 'تذكير عرض سعر', 'تذكير بعرض السعر رقم {{2}} لـ {{1}}.'],
    ['request_documents', 'طلب مستندات', 'نرجو تزويدنا بالمستندات: {{2}}'],
    ['appointment_confirm', 'تأكيد موعد', 'تم تأكيد موعدكم بتاريخ {{1}} الساعة {{2}}.'],
    ['project_status', 'إشعار حالة المشروع', 'تحديث مشروع {{1}}: {{2}}'],
  ];
  return rows.map(([name, ar, body]) => ({
    id: uid('tpl'),
    name,
    display_name_ar: ar,
    category: 'UTILITY',
    language: 'ar',
    body,
    variables: [],
    status: 'draft',
    meta_template_name: name,
    created_at: t,
    updated_at: t,
  }));
}

export const memoryStore = {
  ensureEnvAccount(phoneNumberId: string, partial?: Partial<WhatsAppAccount>): WhatsAppAccount {
    const db = getMemoryDb();
    let acc = db.accounts.find((a) => a.phone_number_id === phoneNumberId);
    if (acc) return acc;
    const t = now();
    acc = {
      id: uid('acc'),
      business_name: partial?.business_name || 'توقع سلامة',
      phone_number: partial?.phone_number || null,
      phone_number_id: phoneNumberId,
      waba_id: partial?.waba_id || null,
      access_token_encrypted: null,
      webhook_verify_token: null,
      status: 'active',
      provider: 'meta',
      last_webhook_at: null,
      last_error: null,
      created_at: t,
      updated_at: t,
    };
    db.accounts.push(acc);
    return acc;
  },

  findAccountByPhoneNumberId(phoneNumberId: string): WhatsAppAccount | null {
    return getMemoryDb().accounts.find((a) => a.phone_number_id === phoneNumberId) || null;
  },

  touchAccountWebhook(accountId: string) {
    const acc = getMemoryDb().accounts.find((a) => a.id === accountId);
    if (acc) {
      acc.last_webhook_at = now();
      acc.updated_at = acc.last_webhook_at;
    }
  },

  findClientByPhone(phone: string): WaCrmClient | null {
    const n = normalizeWhatsAppPhone(phone);
    if (!n) return null;
    const byClientPhone = getMemoryDb().clients.find(
      (c) => normalizeWhatsAppPhone(c.phone) === n
    );
    if (byClientPhone) return byClientPhone;
    const contact = getMemoryDb().contacts.find((c) => c.phone_number === n);
    if (!contact) return null;
    return getMemoryDb().clients.find((cl) => cl.id === contact.customer_id) || null;
  },

  findContactByPhone(phone: string): CustomerWhatsAppContact | null {
    const n = normalizeWhatsAppPhone(phone);
    if (!n) return null;
    return getMemoryDb().contacts.find((c) => c.phone_number === n) || null;
  },

  createLeadFromWhatsApp(input: {
    phone: string;
    profileName?: string | null;
  }): WaCrmClient {
    const db = getMemoryDb();
    const existing = this.findClientByPhone(input.phone);
    if (existing) return existing;

    const t = now();
    const code = `LEAD-WA-${String(db.leadSeq++).padStart(4, '0')}`;
    const name = input.profileName?.trim() || `عميل واتساب ${input.phone.slice(-4)}`;
    const client: WaCrmClient = {
      id: uid('cli'),
      client_code: code,
      name,
      owner_name: input.profileName || name,
      phone: normalizeWhatsAppPhone(input.phone),
      email: null,
      business_name: null,
      activity_type: null,
      city: null,
      district: null,
      street: null,
      region: null,
      building_area: null,
      floors_count: null,
      pipeline_stage: 'marketing',
      lead_status: 'new',
      lead_notes: 'تم الإنشاء تلقائياً من WhatsApp',
      lead_source: 'WhatsApp',
      source_channel: 'whatsapp',
      first_contact_at: t,
      last_contact_date: t.slice(0, 10),
      whatsapp_profile_name: input.profileName || null,
      quotation_status: 'مسودة',
      quotation_number: null,
      created_at: t,
      updated_at: t,
    };
    db.clients.push(client);
    this.upsertContact({
      customer_id: client.id,
      phone_number: client.phone!,
      profile_name: input.profileName || null,
      wa_contact_id: null,
    });
    this.audit('lead.created', 'client', client.id, null, {
      source: 'whatsapp',
      phone: client.phone,
    });
    return client;
  },

  upsertContact(input: {
    customer_id: string;
    phone_number: string;
    profile_name?: string | null;
    wa_contact_id?: string | null;
  }): CustomerWhatsAppContact {
    const db = getMemoryDb();
    const phone = normalizeWhatsAppPhone(input.phone_number)!;
    let row = db.contacts.find((c) => c.phone_number === phone);
    const t = now();
    if (row) {
      row.customer_id = input.customer_id;
      row.profile_name = input.profile_name ?? row.profile_name;
      row.wa_contact_id = input.wa_contact_id ?? row.wa_contact_id;
      row.updated_at = t;
      return row;
    }
    row = {
      id: uid('ct'),
      customer_id: input.customer_id,
      phone_number: phone,
      wa_contact_id: input.wa_contact_id || null,
      profile_name: input.profile_name || null,
      is_primary: true,
      created_at: t,
      updated_at: t,
    };
    db.contacts.push(row);
    return row;
  },

  findOrCreateConversation(input: {
    customer_id: string;
    account_id: string | null;
    phone_number: string;
  }): WhatsAppConversation {
    const db = getMemoryDb();
    const phone = normalizeWhatsAppPhone(input.phone_number)!;
    let conv = db.conversations.find(
      (c) =>
        c.phone_number === phone &&
        (input.account_id ? c.whatsapp_account_id === input.account_id : true)
    );
    if (conv) {
      conv.customer_id = input.customer_id;
      conv.updated_at = now();
      if (conv.status === 'closed') conv.status = 'open';
      return conv;
    }
    const t = now();
    conv = {
      id: uid('conv'),
      customer_id: input.customer_id,
      whatsapp_account_id: input.account_id,
      phone_number: phone,
      status: 'open',
      assigned_user_id: null,
      last_message_at: null,
      last_message_preview: null,
      unread_count: 0,
      service_window_expires_at: null,
      created_at: t,
      updated_at: t,
    };
    db.conversations.push(conv);
    this.audit('conversation.created', 'whatsapp_conversation', conv.id, null, {
      phone,
    });
    return conv;
  },

  insertMessage(input: Omit<WhatsAppMessage, 'id' | 'created_at'> & { id?: string }): {
    message: WhatsAppMessage;
    duplicate: boolean;
  } {
    const db = getMemoryDb();
    if (input.whatsapp_message_id) {
      const existing = db.messages.find(
        (m) => m.whatsapp_message_id === input.whatsapp_message_id
      );
      if (existing) return { message: existing, duplicate: true };
    }
    const t = now();
    const message: WhatsAppMessage = {
      id: input.id || uid('msg'),
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
      created_at: t,
    };
    db.messages.push(message);

    const conv = db.conversations.find((c) => c.id === message.conversation_id);
    if (conv) {
      conv.last_message_at = message.timestamp;
      conv.last_message_preview = (message.text || message.caption || message.message_type || '').slice(
        0,
        160
      );
      conv.updated_at = t;
      if (message.direction === 'inbound') {
        conv.unread_count += 1;
        const expires = new Date(message.timestamp);
        expires.setHours(expires.getHours() + 24);
        conv.service_window_expires_at = expires.toISOString();
      }
    }
    return { message, duplicate: false };
  },

  updateMessageStatus(
    providerId: string,
    status: WhatsAppMessage['status'],
    error?: { code?: string | null; message?: string | null }
  ): WhatsAppMessage | null {
    const msg = getMemoryDb().messages.find((m) => m.whatsapp_message_id === providerId);
    if (!msg) return null;
    msg.status = status;
    if (error?.code) msg.error_code = error.code;
    if (error?.message) msg.error_message = error.message;
    return msg;
  },

  listConversations(filter?: { status?: string; unassigned?: boolean }): WhatsAppConversation[] {
    let rows = [...getMemoryDb().conversations];
    if (filter?.status) rows = rows.filter((c) => c.status === filter.status);
    if (filter?.unassigned) rows = rows.filter((c) => !c.assigned_user_id);
    return rows.sort((a, b) =>
      String(b.last_message_at || b.created_at).localeCompare(String(a.last_message_at || a.created_at))
    );
  },

  getConversation(id: string): WhatsAppConversation | null {
    return getMemoryDb().conversations.find((c) => c.id === id) || null;
  },

  listMessages(conversationId: string): WhatsAppMessage[] {
    return getMemoryDb()
      .messages.filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },

  markConversationRead(conversationId: string, userId?: string | null) {
    const conv = this.getConversation(conversationId);
    if (!conv) return;
    conv.unread_count = 0;
    conv.updated_at = now();
    this.audit('conversation.opened', 'whatsapp_conversation', conversationId, userId || null, {});
  },

  updateConversation(
    id: string,
    patch: Partial<WhatsAppConversation>,
    actorUserId?: string | null
  ): WhatsAppConversation | null {
    const conv = this.getConversation(id);
    if (!conv) return null;
    Object.assign(conv, patch, { updated_at: now() });
    if (patch.status) {
      this.audit('conversation.status_changed', 'whatsapp_conversation', id, actorUserId || null, {
        status: patch.status,
      });
    }
    if (patch.assigned_user_id !== undefined) {
      this.audit('conversation.assigned', 'whatsapp_conversation', id, actorUserId || null, {
        assigned_user_id: patch.assigned_user_id,
      });
    }
    return conv;
  },

  getClient(id: string): WaCrmClient | null {
    return getMemoryDb().clients.find((c) => c.id === id) || null;
  },

  updateClient(
    id: string,
    patch: Partial<WaCrmClient>,
    actorUserId?: string | null
  ): WaCrmClient | null {
    const c = this.getClient(id);
    if (!c) return null;
    Object.assign(c, patch, { updated_at: now() });
    this.audit('customer.updated', 'client', id, actorUserId || null, { fields: Object.keys(patch) });
    return c;
  },

  createOpportunity(input: {
    customer_id: string;
    conversation_id?: string | null;
    service?: string | null;
    estimated_value?: number | null;
    probability?: number | null;
    expected_close_date?: string | null;
    title?: string | null;
    assigned_user_id?: string | null;
    notes?: string | null;
  }): CrmOpportunity {
    const db = getMemoryDb();
    // Idempotency: one open WhatsApp opportunity per conversation
    if (input.conversation_id) {
      const existing = db.opportunities.find(
        (o) =>
          o.conversation_id === input.conversation_id &&
          o.status === 'open' &&
          o.source === 'WhatsApp'
      );
      if (existing) return existing;
    }
    const t = now();
    const opp: CrmOpportunity = {
      id: uid('opp'),
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
      created_at: t,
      updated_at: t,
    };
    db.opportunities.push(opp);
    const client = this.getClient(input.customer_id);
    if (client) {
      client.pipeline_stage = 'sales';
      client.lead_status = 'مؤهل';
      client.updated_at = t;
    }
    this.audit('opportunity.created', 'crm_opportunity', opp.id, input.assigned_user_id || null, {
      customer_id: input.customer_id,
      source: 'WhatsApp',
    });
    return opp;
  },

  listOpportunities(customerId?: string): CrmOpportunity[] {
    const rows = getMemoryDb().opportunities;
    return customerId ? rows.filter((o) => o.customer_id === customerId) : rows;
  },

  addNotification(input: Omit<WhatsAppNotification, 'id' | 'created_at' | 'read_at'> & { read_at?: string | null }) {
    const row: WhatsAppNotification = {
      id: uid('nt'),
      user_id: input.user_id,
      conversation_id: input.conversation_id,
      customer_id: input.customer_id,
      title: input.title,
      body: input.body,
      read_at: input.read_at || null,
      created_at: now(),
    };
    getMemoryDb().notifications.push(row);
    return row;
  },

  listTemplates(): WhatsAppTemplate[] {
    return [...getMemoryDb().templates];
  },

  upsertTemplate(tpl: Partial<WhatsAppTemplate> & { name: string; body: string }): WhatsAppTemplate {
    const db = getMemoryDb();
    const existing = db.templates.find((t) => t.name === tpl.name && t.language === (tpl.language || 'ar'));
    const t = now();
    if (existing) {
      Object.assign(existing, tpl, { updated_at: t });
      return existing;
    }
    const row: WhatsAppTemplate = {
      id: uid('tpl'),
      name: tpl.name,
      display_name_ar: tpl.display_name_ar || tpl.name,
      category: tpl.category || 'UTILITY',
      language: tpl.language || 'ar',
      body: tpl.body,
      variables: tpl.variables || [],
      status: tpl.status || 'draft',
      meta_template_name: tpl.meta_template_name || tpl.name,
      created_at: t,
      updated_at: t,
    };
    db.templates.push(row);
    return row;
  },

  createCampaign(input: {
    name: string;
    template_id?: string | null;
    audience_filter?: Record<string, unknown>;
    scheduled_at?: string | null;
    created_by?: string | null;
  }): WhatsAppCampaign {
    const t = now();
    const row: WhatsAppCampaign = {
      id: uid('camp'),
      name: input.name,
      template_id: input.template_id || null,
      audience_filter: input.audience_filter || {},
      scheduled_at: input.scheduled_at || null,
      status: input.scheduled_at ? 'scheduled' : 'draft',
      stats: {
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        replies: 0,
        leads: 0,
        opportunities: 0,
        conversions: 0,
      },
      created_by: input.created_by || null,
      created_at: t,
      updated_at: t,
    };
    getMemoryDb().campaigns.push(row);
    this.audit('campaign.created', 'whatsapp_campaign', row.id, input.created_by || null, {
      name: row.name,
    });
    return row;
  },

  listCampaigns(): WhatsAppCampaign[] {
    return [...getMemoryDb().campaigns];
  },

  listAutomations(): WhatsAppAutomation[] {
    return [...getMemoryDb().automations];
  },

  upsertAutomation(input: Partial<WhatsAppAutomation> & { name: string; trigger: string }): WhatsAppAutomation {
    const db = getMemoryDb();
    const t = now();
    if (input.id) {
      const existing = db.automations.find((a) => a.id === input.id);
      if (existing) {
        Object.assign(existing, input, { updated_at: t });
        return existing;
      }
    }
    const row: WhatsAppAutomation = {
      id: uid('auto'),
      name: input.name,
      trigger: input.trigger,
      conditions: input.conditions || {},
      action: input.action || 'send_template',
      template_id: input.template_id || null,
      delay_minutes: input.delay_minutes || 0,
      active: Boolean(input.active),
      created_at: t,
      updated_at: t,
    };
    db.automations.push(row);
    return row;
  },

  saveExtraction(input: {
    conversation_id: string;
    customer_id?: string | null;
    message_id?: string | null;
    proposed: Record<string, unknown>;
  }): LeadExtractionProposal {
    const t = now();
    const row: LeadExtractionProposal = {
      id: uid('ext'),
      conversation_id: input.conversation_id,
      customer_id: input.customer_id || null,
      message_id: input.message_id || null,
      proposed: input.proposed,
      status: 'pending',
      reviewed_by: null,
      created_at: t,
      updated_at: t,
    };
    getMemoryDb().extractions.push(row);
    return row;
  },

  listExtractions(conversationId: string): LeadExtractionProposal[] {
    return getMemoryDb().extractions.filter((e) => e.conversation_id === conversationId);
  },

  reviewExtraction(
    id: string,
    status: LeadExtractionProposal['status'],
    proposed?: Record<string, unknown>,
    reviewer?: string | null
  ): LeadExtractionProposal | null {
    const row = getMemoryDb().extractions.find((e) => e.id === id);
    if (!row) return null;
    row.status = status;
    if (proposed) row.proposed = proposed;
    row.reviewed_by = reviewer || null;
    row.updated_at = now();
    if (status === 'confirmed' || status === 'edited') {
      const clientId = row.customer_id;
      if (clientId) {
        const patch: Partial<WaCrmClient> = {};
        const p = row.proposed;
        if (typeof p.activity === 'string') patch.activity_type = p.activity;
        if (typeof p.city === 'string') patch.city = p.city;
        if (typeof p.area === 'number') patch.building_area = p.area;
        if (typeof p.area === 'string' && p.area) patch.building_area = Number(p.area) || null;
        if (typeof p.requested_service === 'string') {
          patch.lead_notes = [patch.lead_notes, `خدمة مطلوبة: ${p.requested_service}`]
            .filter(Boolean)
            .join('\n');
        }
        if (typeof p.name === 'string') patch.owner_name = p.name;
        if (typeof p.business_name === 'string') patch.business_name = p.business_name;
        if (typeof p.email === 'string') patch.email = p.email;
        this.updateClient(clientId, patch, reviewer);
      }
    }
    return row;
  },

  addAttachment(input: {
    customer_id: string;
    conversation_id?: string | null;
    message_id?: string | null;
    file_name?: string | null;
    media_type?: string | null;
    storage_path?: string | null;
    media_url?: string | null;
    size_bytes?: number | null;
  }) {
    const row = {
      id: uid('att'),
      customer_id: input.customer_id,
      conversation_id: input.conversation_id || null,
      message_id: input.message_id || null,
      file_name: input.file_name || null,
      media_type: input.media_type || null,
      storage_path: input.storage_path || null,
      media_url: input.media_url || null,
      size_bytes: input.size_bytes ?? null,
      created_at: now(),
    };
    getMemoryDb().attachments.push(row);
    return row;
  },

  listAttachments(customerId: string) {
    return getMemoryDb().attachments.filter((a) => a.customer_id === customerId);
  },

  audit(
    action: string,
    entity: string,
    entity_id: string | null,
    actor_user_id: string | null,
    detail: Record<string, unknown>
  ) {
    getMemoryDb().audit.push({
      id: uid('aud'),
      action,
      entity,
      entity_id,
      actor_user_id,
      detail,
      created_at: now(),
    });
  },

  listAudit() {
    return [...getMemoryDb().audit];
  },

  stats(range: 'today' | '7d' | '30d' | 'custom' = '30d') {
    const db = getMemoryDb();
    const days = range === 'today' ? 1 : range === '7d' ? 7 : 30;
    const since = Date.now() - days * 86400000;
    const leads = db.clients.filter(
      (c) => c.lead_source === 'WhatsApp' && new Date(c.created_at).getTime() >= since
    );
    const openConversations = db.conversations.filter((c) => c.status === 'open').length;
    const unreadMessages = db.conversations.reduce((s, c) => s + c.unread_count, 0);
    const quotesGenerated = db.clients.filter(
      (c) => c.lead_source === 'WhatsApp' && c.quotation_number
    ).length;
    const projectsWon = db.clients.filter(
      (c) =>
        c.lead_source === 'WhatsApp' &&
        (c.pipeline_stage === 'projects' || c.pipeline_stage === 'completed')
    ).length;
    const converted = db.clients.filter(
      (c) => c.lead_source === 'WhatsApp' && c.pipeline_stage !== 'marketing'
    ).length;
    return {
      newLeads: leads.length,
      openConversations,
      unreadMessages,
      avgResponseMinutes: null as number | null,
      conversionRate: leads.length ? Math.round((converted / leads.length) * 100) : 0,
      quotesGenerated,
      projectsWon,
      range,
    };
  },
};
