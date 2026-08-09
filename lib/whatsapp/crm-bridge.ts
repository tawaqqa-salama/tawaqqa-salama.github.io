/**
 * WhatsApp ↔ existing CRM bridge.
 * CRM spine remains `clients` + pipeline — no parallel Customer/Lead tables.
 */

import { nextLeadCode } from '@/lib/business/document-numbers';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { insertClientSafe } from '@/lib/supabase/safe-client-write';
import type { ClientRecord } from '@/lib/types/client';
import { digitsOnly, normalizeWhatsAppPhone } from '@/lib/whatsapp/phone';
import { memoryStore, type WaCrmClient } from '@/lib/whatsapp/store/memory';

export type CrmClientRef = {
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
};

/** Phone shapes historically stored on clients (05… / 966… / +966…). */
export function phoneLookupCandidates(e164: string): string[] {
  const n = normalizeWhatsAppPhone(e164);
  if (!n) return [];
  const d = digitsOnly(n);
  const local = d.startsWith('966') ? `0${d.slice(3)}` : d;
  const noPlus = d;
  const withPlus = `+${d}`;
  const bareMobile = d.startsWith('966') ? d.slice(3) : d;
  return Array.from(new Set([withPlus, noPlus, local, bareMobile, n]));
}

function mapClient(row: ClientRecord | WaCrmClient): CrmClientRef {
  return {
    id: row.id,
    client_code: row.client_code,
    name: row.name,
    owner_name: row.owner_name ?? null,
    phone: row.phone ?? null,
    email: ('email' in row ? row.email : null) ?? null,
    business_name: row.business_name ?? null,
    activity_type: row.activity_type ?? null,
    city: row.city ?? null,
    district: row.district ?? null,
    street: row.street ?? null,
    region: row.region ?? null,
    building_area: row.building_area ?? null,
    floors_count: row.floors_count ?? null,
    pipeline_stage: row.pipeline_stage || 'marketing',
    lead_status: row.lead_status ?? null,
    lead_notes: row.lead_notes ?? null,
    lead_source: ('lead_source' in row ? row.lead_source : null) ?? null,
    source_channel: ('source_channel' in row ? row.source_channel : null) ?? null,
    first_contact_at: ('first_contact_at' in row ? row.first_contact_at : null) ?? null,
    last_contact_date: row.last_contact_date ?? null,
    whatsapp_profile_name:
      ('whatsapp_profile_name' in row ? row.whatsapp_profile_name : null) ?? null,
    quotation_status: row.quotation_status ?? null,
    quotation_number: row.quotation_number ?? null,
  };
}

function shouldUseMemoryCrm(): boolean {
  // Tests / demo showcase only — production Node with Supabase uses real clients
  if (process.env.WHATSAPP_FORCE_MEMORY === 'true') return true;
  if (!isSupabaseConfigured || isDemoMode) return true;
  return false;
}

export function isWhatsAppCrmMemoryMode(): boolean {
  return shouldUseMemoryCrm();
}

async function findClientInSupabase(phoneE164: string): Promise<CrmClientRef | null> {
  const candidates = phoneLookupCandidates(phoneE164);
  if (!candidates.length) return null;

  // 1) customer_whatsapp_contacts (after 031)
  const { data: contact } = await supabase
    .from('customer_whatsapp_contacts')
    .select('customer_id')
    .eq('phone_number', phoneE164)
    .maybeSingle();
  if (contact?.customer_id) {
    const { data: byContact } = await supabase
      .from('clients')
      .select('*')
      .eq('id', contact.customer_id)
      .maybeSingle();
    if (byContact) return mapClient(byContact as ClientRecord);
  }

  // 2) clients.phone exact match against common stored forms
  const { data: byPhone } = await supabase
    .from('clients')
    .select('*')
    .in('phone', candidates)
    .limit(1);
  if (byPhone?.[0]) return mapClient(byPhone[0] as ClientRecord);

  return null;
}

async function createLeadInSupabase(input: {
  phone: string;
  profileName?: string | null;
}): Promise<CrmClientRef> {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) throw new Error('invalid_phone');

  // Race-safe: re-check before insert
  const existing = await findClientInSupabase(phone);
  if (existing) return existing;

  const leadCode = await nextLeadCode();
  const name = input.profileName?.trim() || `عميل واتساب ${phone.slice(-4)}`;
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    client_code: leadCode,
    name,
    owner_name: input.profileName || name,
    phone, // store normalized E.164 going forward
    business_name: null,
    pipeline_stage: 'marketing',
    lead_status: 'new',
    lead_notes: 'تم الإنشاء تلقائياً من WhatsApp',
    lead_source: 'WhatsApp',
    source_channel: 'whatsapp',
    first_contact_at: now,
    last_contact_date: now.slice(0, 10),
    whatsapp_profile_name: input.profileName || null,
    financial_status: 'بانتظار الدفعة',
    engineering_status: 'جديد',
    quotation_status: 'مسودة',
    visit_status: 'لم تُجدول',
    final_report_status: 'قيد الإعداد',
  };

  const { data, error } = await insertClientSafe(payload);
  if (error || !data) {
    throw new Error(error || 'تعذر إنشاء عميل واتساب');
  }

  const client = mapClient(data as unknown as ClientRecord);

  // Link WhatsApp contact row (031) — ignore if table missing
  await supabase.from('customer_whatsapp_contacts').upsert(
    {
      customer_id: client.id,
      phone_number: phone,
      profile_name: input.profileName || null,
      is_primary: true,
      updated_at: now,
    },
    { onConflict: 'phone_number' }
  );

  return client;
}

/** Find CRM client by WhatsApp phone — never invents a second customer master. */
export async function findCrmClientByPhone(phoneInput: string): Promise<CrmClientRef | null> {
  const phone = normalizeWhatsAppPhone(phoneInput);
  if (!phone) return null;

  if (shouldUseMemoryCrm()) {
    const m = memoryStore.findClientByPhone(phone);
    return m ? mapClient(m) : null;
  }
  return findClientInSupabase(phone);
}

/**
 * Resolve client for inbound WhatsApp:
 * existing clients row → reuse; else create Lead via nextLeadCode + marketing defaults.
 */
export async function resolveCrmClientForWhatsApp(input: {
  phone: string;
  profileName?: string | null;
}): Promise<{ client: CrmClientRef; createdLead: boolean }> {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) throw new Error('invalid_phone');

  const existing = await findCrmClientByPhone(phone);
  if (existing) {
    if (shouldUseMemoryCrm()) {
      memoryStore.upsertContact({
        customer_id: existing.id,
        phone_number: phone,
        profile_name: input.profileName,
      });
      memoryStore.updateClient(existing.id, {
        last_contact_date: new Date().toISOString().slice(0, 10),
        whatsapp_profile_name: input.profileName || existing.whatsapp_profile_name,
      });
      const refreshed = memoryStore.getClient(existing.id);
      return { client: refreshed ? mapClient(refreshed) : existing, createdLead: false };
    }

    const patch: Record<string, unknown> = {
      last_contact_date: new Date().toISOString().slice(0, 10),
    };
    if (input.profileName) patch.whatsapp_profile_name = input.profileName;
    await supabase.from('clients').update(patch).eq('id', existing.id);
    await supabase.from('customer_whatsapp_contacts').upsert(
      {
        customer_id: existing.id,
        phone_number: phone,
        profile_name: input.profileName || existing.whatsapp_profile_name,
        is_primary: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'phone_number' }
    );
    return { client: { ...existing, ...patch } as CrmClientRef, createdLead: false };
  }

  if (shouldUseMemoryCrm()) {
    const created = memoryStore.createLeadFromWhatsApp({
      phone,
      profileName: input.profileName,
    });
    return { client: mapClient(created), createdLead: true };
  }

  const created = await createLeadInSupabase({ phone, profileName: input.profileName });
  return { client: created, createdLead: true };
}

/** Move client into sales pipeline (existing convert-to-sales pattern). */
export async function advanceClientToSalesPipeline(
  clientId: string,
  opts?: { leadStatus?: string }
): Promise<void> {
  const lead_status = opts?.leadStatus || 'مؤهل';
  if (shouldUseMemoryCrm()) {
    memoryStore.updateClient(clientId, { pipeline_stage: 'sales', lead_status });
    return;
  }
  await supabase
    .from('clients')
    .update({ pipeline_stage: 'sales', lead_status })
    .eq('id', clientId);
}

export async function updateCrmClientFields(
  clientId: string,
  patch: Partial<CrmClientRef>
): Promise<CrmClientRef | null> {
  if (shouldUseMemoryCrm()) {
    const row = memoryStore.updateClient(clientId, patch as Partial<WaCrmClient>);
    return row ? mapClient(row) : null;
  }
  const { data, error } = await supabase
    .from('clients')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId)
    .select('*')
    .maybeSingle();
  if (error || !data) return null;
  return mapClient(data as ClientRecord);
}

export async function getCrmClient(clientId: string): Promise<CrmClientRef | null> {
  if (shouldUseMemoryCrm()) {
    const row = memoryStore.getClient(clientId);
    return row ? mapClient(row) : null;
  }
  const { data } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
  return data ? mapClient(data as ClientRecord) : null;
}
