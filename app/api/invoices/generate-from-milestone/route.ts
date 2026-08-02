import { NextResponse } from 'next/server';
import { generateTaxInvoiceFromMilestone } from '@/lib/invoices/tax-invoice-service';
import type { GenerateTaxInvoiceRequest } from '@/lib/types/tax-invoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateTaxInvoiceRequest;
    if (!body?.clientId) {
      return NextResponse.json(
        { ok: false, error: 'clientId مطلوب', invoice: null, milestone: null, messages: [] },
        { status: 400 }
      );
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
