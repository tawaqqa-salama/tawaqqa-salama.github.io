import { NextResponse } from 'next/server';
import { memoryStore } from '@/lib/whatsapp/store/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || undefined;
  const unassigned = url.searchParams.get('unassigned') === '1';
  const conversations = memoryStore.listConversations({ status, unassigned });
  const enriched = conversations.map((c) => {
    const client = memoryStore.getClient(c.customer_id);
    return {
      ...c,
      customer: client
        ? {
            id: client.id,
            name: client.business_name || client.owner_name || client.name,
            lead_status: client.lead_status,
            lead_source: client.lead_source,
            pipeline_stage: client.pipeline_stage,
            phone: client.phone,
          }
        : null,
    };
  });
  return NextResponse.json({ ok: true, conversations: enriched });
}
