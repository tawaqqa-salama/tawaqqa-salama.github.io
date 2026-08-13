import { NextResponse } from 'next/server';
import { getCrmClient } from '@/lib/whatsapp/crm-bridge';
import { waRepository } from '@/lib/whatsapp/store/repository';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || undefined;
  const unassigned = url.searchParams.get('unassigned') === '1';
  const conversations = await waRepository.listConversations({
    status,
    unassigned,
    companyId: gated.ctx.tenantId,
  });
  const enriched = await Promise.all(
    conversations.map(async (c) => {
      const client = await getCrmClient(c.customer_id);
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
    })
  );
  return NextResponse.json({ ok: true, conversations: enriched });
}
