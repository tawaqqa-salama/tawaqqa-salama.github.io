import { NextResponse } from 'next/server';
import { createWhatsAppProvider } from '@/lib/whatsapp/provider';
import { memoryStore, getMemoryDb } from '@/lib/whatsapp/store/memory';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  return NextResponse.json({
    ok: true,
    campaigns: memoryStore.listCampaigns(),
    automations: memoryStore.listAutomations(),
  });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  const body = (await request.json()) as {
    action?: 'create' | 'send' | 'automation';
    name?: string;
    template_id?: string;
    audience_filter?: Record<string, unknown>;
    scheduled_at?: string;
    created_by?: string;
    campaignId?: string;
    // automation
    trigger?: string;
    conditions?: Record<string, unknown>;
    delay_minutes?: number;
    active?: boolean;
    id?: string;
  };

  if (body.action === 'automation') {
    if (!body.name || !body.trigger) {
      return NextResponse.json({ ok: false, error: 'name_trigger_required' }, { status: 400 });
    }
    const automation = memoryStore.upsertAutomation({
      id: body.id,
      name: body.name,
      trigger: body.trigger,
      conditions: body.conditions,
      template_id: body.template_id || null,
      delay_minutes: body.delay_minutes,
      active: body.active,
    });
    return NextResponse.json({ ok: true, automation });
  }

  if (body.action === 'send') {
    if (!body.campaignId) {
      return NextResponse.json({ ok: false, error: 'campaignId_required' }, { status: 400 });
    }
    const campaign = memoryStore.listCampaigns().find((c) => c.id === body.campaignId);
    if (!campaign) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const template = memoryStore
      .listTemplates()
      .find((t) => t.id === campaign.template_id);
    if (!template) {
      return NextResponse.json({ ok: false, error: 'template_required' }, { status: 400 });
    }
    // Only WhatsApp-sourced / opted-in contacts with phone
    const audience = getMemoryDb().clients.filter((c) => {
      if (!c.phone) return false;
      if (c.source_channel === 'whatsapp' || c.lead_source === 'WhatsApp') return true;
      // require explicit audience opt-in flag in filter
      return Boolean(campaign.audience_filter?.include_all_with_consent);
    });
    if (!audience.length) {
      return NextResponse.json(
        { ok: false, error: 'no_eligible_recipients' },
        { status: 400 }
      );
    }
    const provider = createWhatsAppProvider();
    campaign.status = 'sending';
    for (const client of audience) {
      const result = await provider.sendTemplate({
        to: client.phone!,
        templateName: template.meta_template_name || template.name,
        language: template.language,
      });
      if (result.ok) campaign.stats.sent += 1;
      else campaign.stats.failed += 1;
    }
    campaign.status = 'completed';
    campaign.updated_at = new Date().toISOString();
    memoryStore.audit('campaign.sent', 'whatsapp_campaign', campaign.id, body.created_by || null, {
      sent: campaign.stats.sent,
      failed: campaign.stats.failed,
    });
    return NextResponse.json({ ok: true, campaign });
  }

  if (!body.name) {
    return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 });
  }
  const campaign = memoryStore.createCampaign({
    name: body.name,
    template_id: body.template_id,
    audience_filter: body.audience_filter,
    scheduled_at: body.scheduled_at,
    created_by: body.created_by,
  });
  return NextResponse.json({ ok: true, campaign });
}
