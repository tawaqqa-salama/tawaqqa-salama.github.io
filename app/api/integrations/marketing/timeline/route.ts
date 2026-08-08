import { NextResponse } from 'next/server';
import { listCustomerTimeline } from '@/lib/marketing/crm-identity';
import { isMarketingCrmMemoryMode } from '@/lib/marketing/crm-identity';
import { marketingMemory } from '@/lib/marketing/store/memory';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const customerId = new URL(request.url).searchParams.get('customerId');
  if (!customerId) {
    return NextResponse.json({ ok: false, error: 'customerId مطلوب' }, { status: 400 });
  }

  const events = await listCustomerTimeline(customerId);

  // Enrich with WhatsApp / social / website when available
  const enriched = [...events];

  if (isMarketingCrmMemoryMode()) {
    for (const c of marketingMemory.conversations.list().filter((x) => x.customer_id === customerId)) {
      enriched.push({
        id: `social-${c.id}`,
        customer_id: customerId,
        event_type: 'social_message',
        channel: c.platform,
        title: `${c.platform} — ${c.thread_type}`,
        body: c.last_message_preview,
        occurred_at: c.last_message_at || c.created_at,
      });
    }
    for (const s of marketingMemory.website.submissions().filter((x) => x.customer_id === customerId)) {
      enriched.push({
        id: `form-${s.id}`,
        customer_id: customerId,
        event_type: 'website_form',
        channel: 'website',
        title: 'نموذج موقع',
        body: JSON.stringify(s.payload).slice(0, 200),
        occurred_at: String(s.created_at),
      });
    }
  } else {
    const { data: wa } = await supabase
      .from('whatsapp_conversations')
      .select('id, last_message_preview, last_message_at, created_at')
      .eq('customer_id', customerId)
      .limit(20);
    for (const c of wa || []) {
      enriched.push({
        id: `wa-${c.id}`,
        customer_id: customerId,
        event_type: 'whatsapp',
        channel: 'whatsapp',
        title: 'WhatsApp',
        body: c.last_message_preview,
        occurred_at: c.last_message_at || c.created_at,
      });
    }
  }

  enriched.sort(
    (a, b) => new Date(String(b.occurred_at)).getTime() - new Date(String(a.occurred_at)).getTime()
  );

  return NextResponse.json({ ok: true, events: enriched });
}
