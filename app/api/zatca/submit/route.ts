import { NextResponse } from 'next/server';
import { submitInvoiceToZatca } from '@/lib/zatca/api-client';
import type { ZatcaInvoiceKind, ZatcaSettings } from '@/lib/zatca/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  uuid?: string;
  invoiceHash?: string;
  invoiceXml?: string;
  invoiceKind?: ZatcaInvoiceKind;
  settings?: ZatcaSettings;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if (!body.uuid || !body.invoiceHash || !body.invoiceXml || !body.settings) {
      return NextResponse.json(
        {
          ok: false,
          status: 'error',
          error: 'الحقول المطلوبة: uuid, invoiceHash, invoiceXml, settings',
        },
        { status: 400 }
      );
    }

    const result = await submitInvoiceToZatca({
      settings: body.settings,
      invoiceKind: body.invoiceKind || body.settings.invoice_kind || 'simplified',
      uuid: body.uuid,
      invoiceHash: body.invoiceHash,
      invoiceXml: body.invoiceXml,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'خطأ غير متوقع أثناء الإرسال',
      },
      { status: 500 }
    );
  }
}
