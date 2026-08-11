import { NextResponse } from 'next/server';
import { generateTaxInvoiceFromMilestone } from '@/lib/invoices/tax-invoice-service';
import type { GenerateTaxInvoiceRequest } from '@/lib/types/tax-invoice';
import { withTenantApi, tenantErrorResponse } from '@/lib/tenant/api-guard';
import { assertTenantRow } from '@/lib/tenant/context';
import { isDemoMode, supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gated = await withTenantApi(request);
  if ('response' in gated) return gated.response;
  try {
    const body = (await request.json()) as GenerateTaxInvoiceRequest;
    if (!body?.clientId) {
      return NextResponse.json(
        { ok: false, error: 'clientId مطلوب', invoice: null, milestone: null, messages: [] },
        { status: 400 }
      );
    }

    if (!isDemoMode) {
      const { data: client } = await supabase
        .from('clients')
        .select('id, company_id')
        .eq('id', body.clientId)
        .maybeSingle();
      try {
        assertTenantRow(gated.ctx, (client as { company_id?: string } | null)?.company_id, 'client');
      } catch (e) {
        return tenantErrorResponse(e);
      }
    }

    const result = await generateTaxInvoiceFromMilestone({
      clientId: body.clientId,
      milestoneId: body.milestoneId,
      contractId: body.contractId,
      percentage: body.percentage,
      title: body.title,
      triggerSource: body.triggerSource || 'manual',
      submitToZatca: body.submitToZatca,
      forceSimplified: body.forceSimplified,
      forceStandard: body.forceStandard,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        invoice: null,
        milestone: null,
        messages: [],
        error: error instanceof Error ? error.message : 'فشل إصدار الفاتورة',
        promptPreview: false,
      },
      { status: 500 }
    );
  }
}
