import { NextResponse } from 'next/server';
import { advanceClientToSalesPipeline } from '@/lib/whatsapp/crm-bridge';
import { waRepository } from '@/lib/whatsapp/store/repository';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  const body = (await request.json()) as {
    customerId?: string;
    conversationId?: string;
    service?: string;
    estimated_value?: number;
    probability?: number;
    expected_close_date?: string;
    title?: string;
    assigned_user_id?: string;
    notes?: string;
  };
  if (!body.customerId) {
    return NextResponse.json({ ok: false, error: 'customerId_required' }, { status: 400 });
  }
  const opportunity = await waRepository.createOpportunity({
    customer_id: body.customerId,
    conversation_id: body.conversationId,
    service: body.service,
    estimated_value: body.estimated_value,
    probability: body.probability,
    expected_close_date: body.expected_close_date,
    title: body.title,
    assigned_user_id: body.assigned_user_id,
    notes: body.notes,
  });

  // Bind to existing CRM pipeline (marketing → sales) — same as convertToSales
  await advanceClientToSalesPipeline(body.customerId);

  return NextResponse.json({
    ok: true,
    opportunity,
    next: { salesPath: `/sales?client=${body.customerId}`, pipeline_stage: 'sales' },
  });
}

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  const url = new URL(request.url);
  const customerId = url.searchParams.get('customerId') || undefined;
  return NextResponse.json({
    ok: true,
    opportunities: await waRepository.listOpportunities(customerId),
  });
}
