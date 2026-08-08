import { NextResponse } from 'next/server';
import { isMarketingCrmMemoryMode } from '@/lib/marketing/crm-identity';
import { marketingMemory } from '@/lib/marketing/store/memory';
import { supabase } from '@/lib/supabase';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

const SOURCES = [
  'WhatsApp',
  'Website',
  'Instagram',
  'Facebook',
  'LinkedIn',
  'TikTok',
  'X',
  'Google',
  'Google Business',
  'Phone',
  'Referral',
  'Campaign',
  'Other',
];

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'marketing' });
  if ('response' in gated) return gated.response;
  const { tenantId } = gated.ctx;

  const clients = isMarketingCrmMemoryMode()
    ? marketingMemory.listClients().filter(
        (c) => !(c as { company_id?: string }).company_id || (c as { company_id?: string }).company_id === tenantId
      )
    : (
        await supabase
          .from('clients')
          .select(
            'id, lead_source, source_channel, first_touch_source, last_touch_source, pipeline_stage, quotation_number, total_amount, lead_status'
          )
          .eq('company_id', tenantId)
      ).data || [];

  const bySource: Record<string, number> = {};
  for (const s of SOURCES) bySource[s] = 0;
  for (const c of clients) {
    const key = c.lead_source || c.first_touch_source || 'Other';
    bySource[key] = (bySource[key] || 0) + 1;
  }

  const leads = clients.filter((c) => (c.pipeline_stage || 'marketing') === 'marketing').length;
  const opportunities = clients.filter((c) => c.pipeline_stage === 'sales').length;
  const quotes = clients.filter((c) => c.quotation_number).length;
  const won = clients.filter((c) =>
    ['finance', 'projects', 'completed'].includes(c.pipeline_stage || '')
  );
  const revenue = won.reduce((s, c) => s + Number(c.total_amount || 0), 0);

  return NextResponse.json({
    ok: true,
    leads_by_source: bySource,
    funnel: {
      leads: clients.length,
      marketing_leads: leads,
      opportunities,
      quotes,
      won_projects: won.length,
      revenue,
    },
  });
}
