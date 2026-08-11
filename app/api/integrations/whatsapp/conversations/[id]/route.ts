import { NextResponse } from 'next/server';
import { getCrmClient } from '@/lib/whatsapp/crm-bridge';
import { waRepository } from '@/lib/whatsapp/store/repository';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  const tenantId = gated.ctx.tenantId;
  const { id } = await ctx.params;
  const conversation = await waRepository.getConversation(id, tenantId);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const [customer, messages, opportunities, extractions, attachments] = await Promise.all([
    getCrmClient(conversation.customer_id),
    waRepository.listMessages(id),
    waRepository.listOpportunities(conversation.customer_id),
    waRepository.listExtractions(id),
    waRepository.listAttachments(conversation.customer_id),
  ]);
  // Defense-in-depth: customer must belong to same tenant when company_id present
  const customerCompany = (customer as { company_id?: string } | null)?.company_id;
  if (customerCompany && customerCompany !== tenantId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    conversation,
    customer,
    messages,
    opportunities,
    extractions,
    attachments,
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  const tenantId = gated.ctx.tenantId;
  const { id } = await ctx.params;
  const body = (await request.json()) as {
    status?: 'open' | 'pending' | 'closed';
    assigned_user_id?: string | null;
    markRead?: boolean;
    userId?: string;
  };
  if (body.markRead) await waRepository.markRead(id, tenantId);
  const conversation = await waRepository.updateConversation(
    id,
    {
      ...(body.status ? { status: body.status } : {}),
      ...(body.assigned_user_id !== undefined ? { assigned_user_id: body.assigned_user_id } : {}),
    },
    tenantId
  );
  if (!conversation) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, conversation });
}
