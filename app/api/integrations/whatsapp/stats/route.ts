import { NextResponse } from 'next/server';
import { isWhatsAppCrmMemoryMode } from '@/lib/whatsapp/crm-bridge';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { memoryStore } from '@/lib/whatsapp/store/memory';
import { waRepository } from '@/lib/whatsapp/store/repository';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  const { tenantId } = gated.ctx;

  const url = new URL(request.url);
  const range = (url.searchParams.get('range') || '30d') as 'today' | '7d' | '30d' | 'custom';

  if (isWhatsAppCrmMemoryMode() || !isSupabaseConfigured) {
    return NextResponse.json({ ok: true, stats: memoryStore.stats(range) });
  }

  const days = range === 'today' ? 1 : range === '7d' ? 7 : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [{ data: waClients }, conversations] = await Promise.all([
    supabase
      .from('clients')
      .select('id, pipeline_stage, lead_status, quotation_number, created_at, lead_source, source_channel')
      .eq('company_id', tenantId)
      .or('lead_source.eq.WhatsApp,source_channel.eq.whatsapp')
      .gte('created_at', since),
    waRepository.listConversations(),
  ]);

  const leads = waClients || [];
  const openConversations = conversations.filter((c) => c.status === 'open').length;
  const unreadMessages = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);
  const quotesGenerated = leads.filter((c) => Boolean(c.quotation_number)).length;
  const projectsWon = leads.filter(
    (c) => c.pipeline_stage === 'projects' || c.pipeline_stage === 'completed'
  ).length;
  const converted = leads.filter((c) => c.pipeline_stage !== 'marketing').length;

  return NextResponse.json({
    ok: true,
    stats: {
      newLeads: leads.length,
      openConversations,
      unreadMessages,
      avgResponseMinutes: null,
      conversionRate: leads.length ? Math.round((converted / leads.length) * 100) : 0,
      quotesGenerated,
      projectsWon,
      range,
    },
  });
}
