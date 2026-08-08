/**
 * In-memory store for Social/Website CRM when demo/tests (no Supabase).
 * Production Node + Supabase uses real tables from 032_social_website_crm.sql.
 */

import { randomUUID } from 'node:crypto';

export type MemClient = {
  id: string;
  client_code: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  business_name: string | null;
  activity_type: string | null;
  city: string | null;
  pipeline_stage: string;
  lead_status: string | null;
  lead_notes: string | null;
  lead_source: string | null;
  source_channel: string | null;
  first_contact_at: string | null;
  last_contact_date: string | null;
  first_touch_source: string | null;
  first_touch_medium: string | null;
  first_touch_campaign: string | null;
  first_touch_content: string | null;
  last_touch_source: string | null;
  last_touch_medium: string | null;
  last_touch_campaign: string | null;
  last_touch_content: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  landing_page: string | null;
  referrer: string | null;
  attribution: Record<string, unknown>;
  quotation_number: string | null;
  total_amount: number | null;
  created_at: string;
  [key: string]: unknown;
};

export type MemSocialAccount = {
  id: string;
  platform: string;
  account_name: string;
  account_id: string;
  profile_url: string | null;
  avatar_url: string | null;
  status: string;
  connection_status: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expiry: string | null;
  scopes: string[];
  last_sync_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type MemConversation = {
  id: string;
  social_account_id: string | null;
  customer_id: string | null;
  platform: string;
  platform_thread_id: string | null;
  contact_name: string | null;
  contact_username: string | null;
  contact_platform_user_id: string | null;
  thread_type: string;
  status: string;
  assigned_user_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  marketing_campaign_id: string | null;
  created_at: string;
};

export type MemMessage = {
  id: string;
  conversation_id: string;
  platform_message_id: string | null;
  direction: 'inbound' | 'outbound';
  message_type: string;
  text: string | null;
  status: string;
  created_at: string;
};

export type MemPost = {
  id: string;
  title: string | null;
  content: string;
  media: unknown[];
  platforms: string[];
  publish_at: string | null;
  status: string;
  marketing_campaign_id: string | null;
  ai_suggested: boolean;
  created_at: string;
  updated_at: string;
  targets: Array<{
    id: string;
    platform: string;
    status: string;
    platform_post_id: string | null;
    error_message: string | null;
    unsupported_reason: string | null;
  }>;
};

export type MemCampaign = {
  id: string;
  name: string;
  objective: string | null;
  channels: string[];
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  target_audience: string | null;
  status: string;
  utm_campaign: string | null;
  content_notes: string | null;
  created_at: string;
};

export type MemWebsiteSite = {
  id: string;
  website_name: string;
  domain: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  company_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  working_hours: string | null;
  social_links: Record<string, string>;
  connection_status: string;
  public_form_token: string | null;
  seo_defaults: Record<string, unknown>;
};

type Db = {
  clients: MemClient[];
  identities: Array<{
    customer_id: string;
    platform: string;
    platform_user_id: string;
    username: string | null;
    display_name: string | null;
    profile_url: string | null;
  }>;
  accounts: MemSocialAccount[];
  conversations: MemConversation[];
  messages: MemMessage[];
  posts: MemPost[];
  campaigns: MemCampaign[];
  timeline: Array<{
    id: string;
    customer_id: string;
    event_type: string;
    channel: string | null;
    title: string;
    body: string | null;
    occurred_at: string;
    related_entity_type?: string | null;
    related_entity_id?: string | null;
    metadata?: Record<string, unknown>;
  }>;
  website: MemWebsiteSite | null;
  pages: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
  forms: Array<Record<string, unknown>>;
  submissions: Array<Record<string, unknown>>;
  blog: Array<Record<string, unknown>>;
  showcases: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  leadSeq: number;
};

const g = globalThis as unknown as { __tawaqMarketingMem?: Db };

function db(): Db {
  if (!g.__tawaqMarketingMem) {
    g.__tawaqMarketingMem = {
      clients: [],
      identities: [],
      accounts: [],
      conversations: [],
      messages: [],
      posts: [],
      campaigns: [],
      timeline: [],
      website: null,
      pages: [],
      services: [],
      forms: [],
      submissions: [],
      blog: [],
      showcases: [],
      audit: [],
      leadSeq: 1,
    };
  }
  return g.__tawaqMarketingMem;
}

export const marketingMemory = {
  reset() {
    g.__tawaqMarketingMem = undefined;
  },

  nextLeadCode() {
    const n = db().leadSeq++;
    const y = new Date().getFullYear();
    return `LD-${y}-${String(n).padStart(3, '0')}`;
  },

  findClient(input: {
    phone?: string | null;
    email?: string | null;
    platform?: string | null;
    platformUserId?: string | null;
  }): MemClient | null {
    const d = db();
    if (input.platform && input.platformUserId) {
      const id = d.identities.find(
        (i) => i.platform === input.platform && i.platform_user_id === input.platformUserId
      );
      if (id) return d.clients.find((c) => c.id === id.customer_id) || null;
    }
    if (input.email) {
      const e = input.email.trim().toLowerCase();
      const byEmail = d.clients.find((c) => (c.email || '').toLowerCase() === e);
      if (byEmail) return byEmail;
    }
    if (input.phone) {
      const digits = input.phone.replace(/\D/g, '');
      const byPhone = d.clients.find((c) => (c.phone || '').replace(/\D/g, '').endsWith(digits.slice(-9)));
      if (byPhone) return byPhone;
    }
    return null;
  },

  createClient(row: Partial<MemClient> & { client_code: string; name: string }): MemClient {
    const c: MemClient = {
      id: randomUUID(),
      client_code: row.client_code,
      name: row.name,
      owner_name: row.owner_name ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      business_name: row.business_name ?? null,
      activity_type: row.activity_type ?? null,
      city: row.city ?? null,
      pipeline_stage: row.pipeline_stage || 'marketing',
      lead_status: row.lead_status ?? 'new',
      lead_notes: row.lead_notes ?? null,
      lead_source: row.lead_source ?? null,
      source_channel: row.source_channel ?? null,
      first_contact_at: row.first_contact_at ?? new Date().toISOString(),
      last_contact_date: row.last_contact_date ?? new Date().toISOString().slice(0, 10),
      first_touch_source: row.first_touch_source ?? null,
      first_touch_medium: row.first_touch_medium ?? null,
      first_touch_campaign: row.first_touch_campaign ?? null,
      first_touch_content: row.first_touch_content ?? null,
      last_touch_source: row.last_touch_source ?? null,
      last_touch_medium: row.last_touch_medium ?? null,
      last_touch_campaign: row.last_touch_campaign ?? null,
      last_touch_content: row.last_touch_content ?? null,
      utm_source: row.utm_source ?? null,
      utm_medium: row.utm_medium ?? null,
      utm_campaign: row.utm_campaign ?? null,
      utm_content: row.utm_content ?? null,
      landing_page: row.landing_page ?? null,
      referrer: row.referrer ?? null,
      attribution: (row.attribution as Record<string, unknown>) || {},
      quotation_number: row.quotation_number ?? null,
      total_amount: row.total_amount ?? null,
      created_at: new Date().toISOString(),
    };
    db().clients.unshift(c);
    return c;
  },

  updateClient(id: string, patch: Record<string, unknown>) {
    const c = db().clients.find((x) => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
  },

  listClients() {
    return db().clients;
  },

  linkIdentity(input: {
    customer_id: string;
    platform: string;
    platform_user_id: string;
    username?: string | null;
    display_name?: string | null;
    profile_url?: string | null;
  }) {
    const d = db();
    const existing = d.identities.find(
      (i) => i.platform === input.platform && i.platform_user_id === input.platform_user_id
    );
    if (existing) {
      Object.assign(existing, input);
      return;
    }
    d.identities.push({
      customer_id: input.customer_id,
      platform: input.platform,
      platform_user_id: input.platform_user_id,
      username: input.username ?? null,
      display_name: input.display_name ?? null,
      profile_url: input.profile_url ?? null,
    });
  },

  addTimeline(input: {
    customer_id: string;
    event_type: string;
    channel?: string | null;
    title: string;
    body?: string | null;
    occurred_at?: string;
    related_entity_type?: string | null;
    related_entity_id?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    db().timeline.unshift({
      id: randomUUID(),
      customer_id: input.customer_id,
      event_type: input.event_type,
      channel: input.channel ?? null,
      title: input.title,
      body: input.body ?? null,
      occurred_at: input.occurred_at || new Date().toISOString(),
      related_entity_type: input.related_entity_type,
      related_entity_id: input.related_entity_id,
      metadata: input.metadata,
    });
  },

  listTimeline(customerId: string) {
    return db().timeline.filter((t) => t.customer_id === customerId);
  },

  accounts: {
    list: () => db().accounts,
    upsert(account: Omit<MemSocialAccount, 'id' | 'created_at'> & { id?: string }) {
      const d = db();
      const existing = d.accounts.find(
        (a) => a.platform === account.platform && a.account_id === account.account_id
      );
      if (existing) {
        Object.assign(existing, account, { updated_at: new Date().toISOString() });
        return existing;
      }
      const row: MemSocialAccount = {
        id: account.id || randomUUID(),
        platform: account.platform,
        account_name: account.account_name,
        account_id: account.account_id,
        profile_url: account.profile_url,
        avatar_url: account.avatar_url,
        status: account.status,
        connection_status: account.connection_status,
        access_token_encrypted: account.access_token_encrypted,
        refresh_token_encrypted: account.refresh_token_encrypted,
        token_expiry: account.token_expiry,
        scopes: account.scopes,
        last_sync_at: account.last_sync_at,
        last_error: account.last_error,
        metadata: account.metadata,
        created_at: new Date().toISOString(),
      };
      d.accounts.push(row);
      return row;
    },
    disconnect(id: string) {
      const a = db().accounts.find((x) => x.id === id);
      if (!a) return null;
      a.connection_status = 'disconnected';
      a.status = 'inactive';
      a.access_token_encrypted = null;
      a.refresh_token_encrypted = null;
      return a;
    },
  },

  conversations: {
    list: () => db().conversations,
    get: (id: string) => db().conversations.find((c) => c.id === id) || null,
    upsert(row: Partial<MemConversation> & { platform: string }) {
      const d = db();
      if (row.id) {
        const existing = d.conversations.find((c) => c.id === row.id);
        if (existing) {
          Object.assign(existing, row);
          return existing;
        }
      }
      const created: MemConversation = {
        id: row.id || randomUUID(),
        social_account_id: row.social_account_id ?? null,
        customer_id: row.customer_id ?? null,
        platform: row.platform,
        platform_thread_id: row.platform_thread_id ?? null,
        contact_name: row.contact_name ?? null,
        contact_username: row.contact_username ?? null,
        contact_platform_user_id: row.contact_platform_user_id ?? null,
        thread_type: row.thread_type || 'message',
        status: row.status || 'open',
        assigned_user_id: row.assigned_user_id ?? null,
        last_message_at: row.last_message_at ?? null,
        last_message_preview: row.last_message_preview ?? null,
        unread_count: row.unread_count ?? 0,
        marketing_campaign_id: row.marketing_campaign_id ?? null,
        created_at: new Date().toISOString(),
      };
      d.conversations.unshift(created);
      return created;
    },
  },

  messages: {
    list: (conversationId: string) =>
      db().messages.filter((m) => m.conversation_id === conversationId),
    add(row: Omit<MemMessage, 'id' | 'created_at'> & { id?: string; created_at?: string }) {
      const m: MemMessage = {
        id: row.id || randomUUID(),
        conversation_id: row.conversation_id,
        platform_message_id: row.platform_message_id,
        direction: row.direction,
        message_type: row.message_type,
        text: row.text,
        status: row.status,
        created_at: row.created_at || new Date().toISOString(),
      };
      db().messages.push(m);
      return m;
    },
  },

  posts: {
    list: () => db().posts,
    get: (id: string) => db().posts.find((p) => p.id === id) || null,
    save(post: MemPost) {
      const d = db();
      const i = d.posts.findIndex((p) => p.id === post.id);
      if (i >= 0) d.posts[i] = post;
      else d.posts.unshift(post);
      return post;
    },
    remove(id: string) {
      db().posts = db().posts.filter((p) => p.id !== id);
    },
  },

  campaigns: {
    list: () => db().campaigns,
    save(c: MemCampaign) {
      const d = db();
      const i = d.campaigns.findIndex((x) => x.id === c.id);
      if (i >= 0) d.campaigns[i] = c;
      else d.campaigns.unshift(c);
      return c;
    },
  },

  website: {
    get: () => db().website,
    save(site: MemWebsiteSite) {
      db().website = site;
      return site;
    },
    pages: () => db().pages,
    savePage(p: Record<string, unknown>) {
      const d = db();
      const i = d.pages.findIndex((x) => x.id === p.id);
      if (i >= 0) d.pages[i] = p;
      else d.pages.push(p);
      return p;
    },
    services: () => db().services,
    saveService(s: Record<string, unknown>) {
      const d = db();
      const i = d.services.findIndex((x) => x.id === s.id);
      if (i >= 0) d.services[i] = s;
      else d.services.push(s);
      return s;
    },
    forms: () => db().forms,
    saveForm(f: Record<string, unknown>) {
      const d = db();
      const i = d.forms.findIndex((x) => x.id === f.id);
      if (i >= 0) d.forms[i] = f;
      else d.forms.push(f);
      return f;
    },
    addSubmission(s: Record<string, unknown>) {
      db().submissions.unshift(s);
      return s;
    },
    submissions: () => db().submissions,
    blog: () => db().blog,
    saveBlog(b: Record<string, unknown>) {
      const d = db();
      const i = d.blog.findIndex((x) => x.id === b.id);
      if (i >= 0) d.blog[i] = b;
      else d.blog.push(b);
      return b;
    },
    showcases: () => db().showcases,
    saveShowcase(s: Record<string, unknown>) {
      const d = db();
      const i = d.showcases.findIndex((x) => x.id === s.id);
      if (i >= 0) d.showcases[i] = s;
      else d.showcases.push(s);
      return s;
    },
  },

  audit(action: string, detail: Record<string, unknown> = {}) {
    db().audit.unshift({
      id: randomUUID(),
      action,
      detail,
      created_at: new Date().toISOString(),
    });
  },

  listAudit: () => db().audit,
};
