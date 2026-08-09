/**
 * Unified CRM identity resolution for Social / Website / WhatsApp.
 * Always uses existing `clients` + pipeline — never creates parallel Lead tables.
 */

import { nextLeadCode } from '@/lib/business/document-numbers';
import {
  buildAttributionPatch,
  channelFromSource,
  normalizeSourceLabel,
  type AttributionTouch,
} from '@/lib/marketing/attribution';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { insertClientSafe } from '@/lib/supabase/safe-client-write';
import type { ClientRecord } from '@/lib/types/client';
import { phoneLookupCandidates } from '@/lib/whatsapp/crm-bridge';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/phone';
import { marketingMemory } from '@/lib/marketing/store/memory';

export type IdentityMatchInput = {
  phone?: string | null;
  email?: string | null;
  platform?: string | null;
  platformUserId?: string | null;
  displayName?: string | null;
  businessName?: string | null;
  city?: string | null;
  activityType?: string | null;
  serviceKey?: string | null;
  messagePreview?: string | null;
  touch: AttributionTouch;
};

export type ResolvedCrmClient = {
  id: string;
  client_code: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  business_name: string | null;
  pipeline_stage: string;
  lead_status: string | null;
  lead_source: string | null;
  source_channel: string | null;
  first_touch_source: string | null;
  last_touch_source: string | null;
  createdLead: boolean;
};

function isMemoryStore(): boolean {
  if (process.env.SOCIAL_FORCE_MEMORY === 'true') return true;
  if (process.env.WHATSAPP_FORCE_MEMORY === 'true') return true;
  if (!isSupabaseConfigured || isDemoMode) return true;
  return false;
}

export function isMarketingCrmMemoryMode(): boolean {
  return isMemoryStore();
}

function mapRow(row: ClientRecord & Record<string, unknown>, createdLead: boolean): ResolvedCrmClient {
  return {
    id: row.id,
    client_code: row.client_code,
    name: row.name,
    owner_name: row.owner_name ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    business_name: row.business_name ?? null,
    pipeline_stage: row.pipeline_stage || 'marketing',
    lead_status: row.lead_status ?? null,
    lead_source: row.lead_source ?? null,
    source_channel: row.source_channel ?? null,
    first_touch_source: (row as { first_touch_source?: string | null }).first_touch_source ?? null,
    last_touch_source: (row as { last_touch_source?: string | null }).last_touch_source ?? null,
    createdLead,
  };
}

async function linkSocialIdentity(
  customerId: string,
  platform: string,
  platformUserId: string,
  meta?: { username?: string | null; displayName?: string | null; profileUrl?: string | null }
) {
  if (isMemoryStore()) {
    marketingMemory.linkIdentity({
      customer_id: customerId,
      platform,
      platform_user_id: platformUserId,
      username: meta?.username ?? null,
      display_name: meta?.displayName ?? null,
      profile_url: meta?.profileUrl ?? null,
    });
    return;
  }
  await supabase.from('client_social_identities').upsert(
    {
      customer_id: customerId,
      platform,
      platform_user_id: platformUserId,
      username: meta?.username ?? null,
      display_name: meta?.displayName ?? null,
      profile_url: meta?.profileUrl ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'platform,platform_user_id' }
  );
}

async function findExisting(input: IdentityMatchInput): Promise<ClientRecord | null> {
  if (isMemoryStore()) {
    return marketingMemory.findClient(input) as ClientRecord | null;
  }

  if (input.platform && input.platformUserId) {
    const { data: ident } = await supabase
      .from('client_social_identities')
      .select('customer_id')
      .eq('platform', input.platform)
      .eq('platform_user_id', input.platformUserId)
      .maybeSingle();
    if (ident?.customer_id) {
      const { data } = await supabase.from('clients').select('*').eq('id', ident.customer_id).maybeSingle();
      if (data) return data as ClientRecord;
    }
  }

  if (input.email) {
    const email = input.email.trim().toLowerCase();
    const { data } = await supabase.from('clients').select('*').ilike('email', email).limit(1);
    if (data?.[0]) return data[0] as ClientRecord;
  }

  if (input.phone) {
    const e164 = normalizeWhatsAppPhone(input.phone);
    if (e164) {
      const candidates = phoneLookupCandidates(e164);
      const { data } = await supabase.from('clients').select('*').in('phone', candidates).limit(1);
      if (data?.[0]) return data[0] as ClientRecord;
    }
  }

  return null;
}

async function applyPatch(clientId: string, patch: Record<string, unknown>) {
  if (isMemoryStore()) {
    marketingMemory.updateClient(clientId, patch);
    return;
  }
  const { error } = await supabase.from('clients').update(patch).eq('id', clientId);
  if (error && /column|schema/i.test(error.message)) {
    const slim = { ...patch };
    for (const k of Object.keys(slim)) {
      if (
        /first_touch|last_touch|utm_|landing_page|referrer|attribution/i.test(k)
      ) {
        delete slim[k];
      }
    }
    await supabase.from('clients').update(slim).eq('id', clientId);
  }
}

export async function resolveCrmClientFromChannel(
  input: IdentityMatchInput
): Promise<ResolvedCrmClient> {
  const source = normalizeSourceLabel(input.touch.source);
  const channel = input.touch.channel || channelFromSource(source);
  const existing = await findExisting(input);

  if (existing) {
    const attr = buildAttributionPatch(
      existing as ClientRecord & {
        first_touch_source?: string | null;
        attribution?: Record<string, unknown> | null;
      },
      { ...input.touch, source, channel },
      { setLeadSourceIfEmpty: true }
    );
    const notesExtra = input.messagePreview
      ? `\n[${source}] ${input.messagePreview}`.slice(0, 500)
      : '';
    await applyPatch(existing.id, {
      ...attr,
      email: existing.email || input.email || null,
      phone: existing.phone || (input.phone ? normalizeWhatsAppPhone(input.phone) || input.phone : null),
      last_contact_date: new Date().toISOString().slice(0, 10),
      lead_notes: notesExtra
        ? `${existing.lead_notes || ''}${notesExtra}`.trim().slice(0, 4000)
        : existing.lead_notes,
    });
    if (input.platform && input.platformUserId) {
      await linkSocialIdentity(existing.id, input.platform, input.platformUserId, {
        displayName: input.displayName,
      });
    }
    marketingMemory.addTimeline({
      customer_id: existing.id,
      event_type: 'channel_touch',
      channel,
      title: `تفاعل عبر ${source}`,
      body: input.messagePreview || null,
      occurred_at: new Date().toISOString(),
    });
    const refreshed = (await findExisting({ ...input, phone: existing.phone, email: existing.email })) || existing;
    return mapRow(refreshed as ClientRecord & Record<string, unknown>, false);
  }

  // Create Lead on existing clients table
  const leadCode = isMemoryStore() ? marketingMemory.nextLeadCode() : await nextLeadCode();
  const phone = input.phone ? normalizeWhatsAppPhone(input.phone) || input.phone : null;
  const name =
    input.businessName ||
    input.displayName ||
    phone ||
    input.email ||
    `Lead ${source}`;
  const attr = buildAttributionPatch(null, { ...input.touch, source, channel });
  const row = {
    client_code: leadCode,
    name,
    owner_name: input.displayName || name,
    phone,
    email: input.email?.trim().toLowerCase() || null,
    business_name: input.businessName || name,
    activity_type: input.activityType || null,
    city: input.city || null,
    pipeline_stage: 'marketing' as const,
    lead_status: 'new',
    lead_notes: input.messagePreview || null,
    lead_source: source,
    source_channel: channel,
    first_contact_at: new Date().toISOString(),
    last_contact_date: new Date().toISOString().slice(0, 10),
    financial_status: 'بانتظار الدفعة',
    engineering_status: 'جديد',
    quotation_status: 'مسودة',
    visit_status: 'لم تُجدول',
    final_report_status: 'قيد الإعداد',
    ...attr,
  };

  if (isMemoryStore()) {
    const created = marketingMemory.createClient(row);
    if (input.platform && input.platformUserId) {
      await linkSocialIdentity(created.id, input.platform, input.platformUserId, {
        displayName: input.displayName,
      });
    }
    marketingMemory.addTimeline({
      customer_id: created.id,
      event_type: 'lead_created',
      channel,
      title: `Lead جديد من ${source}`,
      body: input.messagePreview || null,
      occurred_at: new Date().toISOString(),
    });
    return mapRow(created as ClientRecord & Record<string, unknown>, true);
  }

  const { data, error } = await insertClientSafe(row as Record<string, unknown>);
  if (error || !data?.id) {
    throw new Error(error || 'تعذر إنشاء العميل');
  }

  if (input.platform && input.platformUserId) {
    await linkSocialIdentity(String(data.id), input.platform, input.platformUserId, {
      displayName: input.displayName,
    });
  }
  await supabase.from('customer_timeline_events').insert({
    customer_id: data.id,
    event_type: 'lead_created',
    channel,
    title: `Lead جديد من ${source}`,
    body: input.messagePreview || null,
    occurred_at: new Date().toISOString(),
  });

  return mapRow(data as ClientRecord & Record<string, unknown>, true);
}

export async function listCustomerTimeline(customerId: string) {
  if (isMemoryStore()) return marketingMemory.listTimeline(customerId);
  const { data } = await supabase
    .from('customer_timeline_events')
    .select('*')
    .eq('customer_id', customerId)
    .order('occurred_at', { ascending: false })
    .limit(100);
  return data || [];
}

export async function appendTimelineEvent(input: {
  customer_id: string;
  event_type: string;
  channel?: string | null;
  title: string;
  body?: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  occurred_at?: string;
  metadata?: Record<string, unknown>;
}) {
  if (isMemoryStore()) {
    marketingMemory.addTimeline(input);
    return;
  }
  await supabase.from('customer_timeline_events').insert({
    ...input,
    occurred_at: input.occurred_at || new Date().toISOString(),
    metadata: input.metadata || {},
  });
}
