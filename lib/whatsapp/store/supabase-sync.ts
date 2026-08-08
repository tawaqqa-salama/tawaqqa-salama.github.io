/**
 * Best-effort persistence of WhatsApp CRM rows into Postgres when Supabase is configured.
 * Runtime logic stays on the memory store (idempotent, fast); this mirrors durable state.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { CrmOpportunity, WhatsAppConversation, WhatsAppMessage } from '@/lib/whatsapp/types';
import type { WaCrmClient } from '@/lib/whatsapp/store/memory';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !isSupabaseConfigured) return null;
  // Reuse app client when service role not available (may hit RLS)
  return supabase;
}

export async function syncClientRow(client: WaCrmClient): Promise<void> {
  const db = serviceClient();
  if (!db) return;
  try {
    await db.from('clients').upsert(
      {
        id: client.id,
        client_code: client.client_code,
        name: client.name,
        owner_name: client.owner_name,
        phone: client.phone,
        email: client.email,
        business_name: client.business_name,
        activity_type: client.activity_type,
        city: client.city,
        district: client.district,
        street: client.street,
        region: client.region,
        building_area: client.building_area,
        floors_count: client.floors_count,
        pipeline_stage: client.pipeline_stage,
        lead_status: client.lead_status,
        lead_notes: client.lead_notes,
        lead_source: client.lead_source,
        source_channel: client.source_channel,
        first_contact_at: client.first_contact_at,
        last_contact_date: client.last_contact_date,
        whatsapp_profile_name: client.whatsapp_profile_name,
        quotation_status: client.quotation_status,
      },
      { onConflict: 'id' }
    );
  } catch {
    // schema may not be applied yet
  }
}

export async function syncConversation(row: WhatsAppConversation): Promise<void> {
  const db = serviceClient();
  if (!db) return;
  try {
    await db.from('whatsapp_conversations').upsert(row, { onConflict: 'id' });
  } catch {
    /* ignore */
  }
}

export async function syncMessage(row: WhatsAppMessage): Promise<void> {
  const db = serviceClient();
  if (!db) return;
  try {
    await db.from('whatsapp_messages').upsert(
      {
        ...row,
        interactive_payload: row.interactive_payload,
        raw_payload: row.raw_payload,
      },
      { onConflict: 'id' }
    );
  } catch {
    /* ignore */
  }
}

export async function syncOpportunity(row: CrmOpportunity): Promise<void> {
  const db = serviceClient();
  if (!db) return;
  try {
    await db.from('crm_opportunities').upsert(row, { onConflict: 'id' });
  } catch {
    /* ignore */
  }
}

export async function syncContact(row: {
  id: string;
  customer_id: string;
  phone_number: string;
  wa_contact_id: string | null;
  profile_name: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}): Promise<void> {
  const db = serviceClient();
  if (!db) return;
  try {
    await db.from('customer_whatsapp_contacts').upsert(row, { onConflict: 'phone_number' });
  } catch {
    /* ignore */
  }
}
