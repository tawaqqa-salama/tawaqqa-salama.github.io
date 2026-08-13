import { randomUUID } from 'node:crypto';
import { isMarketingCrmMemoryMode } from '@/lib/marketing/crm-identity';
import { marketingMemory } from '@/lib/marketing/store/memory';
import { supabase } from '@/lib/supabase';

function isMemoryStore() {
  return isMarketingCrmMemoryMode();
}

export async function listMarketingCampaigns(companyId?: string | null) {
  if (isMemoryStore()) return marketingMemory.campaigns.list();
  if (!companyId) return [];
  const { data } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function saveMarketingCampaign(input: {
  id?: string;
  companyId?: string | null;
  name: string;
  objective?: string | null;
  channels?: string[];
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  target_audience?: string | null;
  status?: string;
  utm_campaign?: string | null;
  content_notes?: string | null;
}) {
  const utm =
    input.utm_campaign ||
    input.name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w\u0600-\u06FF_]/g, '')
      .slice(0, 64);

  if (isMemoryStore()) {
    const row = {
      id: input.id || randomUUID(),
      name: input.name,
      objective: input.objective ?? null,
      channels: input.channels || [],
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      budget: input.budget ?? null,
      target_audience: input.target_audience ?? null,
      status: input.status || 'draft',
      utm_campaign: utm,
      content_notes: input.content_notes ?? null,
      created_at: new Date().toISOString(),
    };
    return marketingMemory.campaigns.save(row);
  }

  if (!input.companyId) throw new Error('company_id_required');

  if (input.id) {
    const { data, error } = await supabase
      .from('marketing_campaigns')
      .update({
        name: input.name,
        objective: input.objective ?? null,
        channels: input.channels || [],
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        budget: input.budget ?? null,
        target_audience: input.target_audience ?? null,
        status: input.status || 'draft',
        utm_campaign: utm,
        content_notes: input.content_notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .eq('company_id', input.companyId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from('marketing_campaigns')
    .insert({
      company_id: input.companyId,
      name: input.name,
      objective: input.objective ?? null,
      channels: input.channels || [],
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      budget: input.budget ?? null,
      target_audience: input.target_audience ?? null,
      status: input.status || 'draft',
      utm_campaign: utm,
      content_notes: input.content_notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function campaignPerformance(campaignId?: string, companyId?: string | null) {
  const campaigns = await listMarketingCampaigns(companyId);
  const clients = isMemoryStore()
    ? marketingMemory.listClients()
    : !companyId
      ? []
      : (
          await supabase
            .from('clients')
            .select(
              'id, lead_source, utm_campaign, pipeline_stage, quotation_number, total_amount, lead_status'
            )
            .eq('company_id', companyId)
        ).data || [];

  return campaigns
    .filter((c) => !campaignId || c.id === campaignId)
    .map((c) => {
      const related = clients.filter(
        (cl) =>
          (cl as { utm_campaign?: string | null }).utm_campaign === c.utm_campaign ||
          (cl.lead_source || '').includes(c.name)
      );
      const qualified = related.filter((cl) => cl.lead_status === 'مؤهل').length;
      const opportunities = related.filter((cl) => cl.pipeline_stage === 'sales').length;
      const quotes = related.filter((cl) => cl.quotation_number).length;
      const won = related.filter((cl) =>
        ['finance', 'projects', 'completed'].includes(cl.pipeline_stage || '')
      );
      const revenue = won.reduce((s, cl) => s + Number(cl.total_amount || 0), 0);
      return {
        campaign: c,
        leads: related.length,
        qualified_leads: qualified,
        opportunities,
        quotes,
        won_projects: won.length,
        revenue,
        cost_per_lead:
          c.budget && related.length ? Number((Number(c.budget) / related.length).toFixed(2)) : null,
      };
    });
}
