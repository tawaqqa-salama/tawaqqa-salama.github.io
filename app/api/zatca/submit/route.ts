import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/require-session';
import { submitInvoiceToZatca } from '@/lib/zatca/api-client';
import { loadZatcaSettings } from '@/lib/zatca/settings';
import type { ZatcaInvoiceKind, ZatcaSettings } from '@/lib/zatca/types';
import { assertLiveOrDemoAllowed } from '@/lib/runtime/mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  uuid?: string;
  invoiceHash?: string;
  invoiceXml?: string;
  invoiceKind?: ZatcaInvoiceKind;
  /** Optional overlay — secrets preferred from server-loaded settings */
  settings?: Partial<ZatcaSettings>;
};

export async function POST(request: Request) {
  const gate = requireApiSession(request);
  if (!gate.ok) return gate.response;

  const live = assertLiveOrDemoAllowed('ZATCA submit');
  if (!live.ok) {
    return NextResponse.json({ ok: false, status: 'error', error: live.error }, { status: 503 });
  }

  try {
    const body = (await request.json()) as Body;
    if (!body.uuid || !body.invoiceHash || !body.invoiceXml) {
      return NextResponse.json(
        {
          ok: false,
          status: 'error',
          error: 'الحقول المطلوبة: uuid, invoiceHash, invoiceXml',
        },
        { status: 400 }
      );
    }

    const serverSettings = await loadZatcaSettings();
    // Never trust client-provided CSID/secret/private key — merge non-secret overlays only
    const settings: ZatcaSettings = {
      ...serverSettings,
      invoice_kind: body.invoiceKind || body.settings?.invoice_kind || serverSettings.invoice_kind,
      environment: body.settings?.environment || serverSettings.environment,
    };

    if (!settings.csid || !settings.secret) {
      return NextResponse.json(
        {
          ok: false,
          status: 'error',
          error: 'إعدادات ZATCA غير مكتملة على السيرفر (CSID/Secret). أكمل onboard من الإعدادات.',
        },
        { status: 400 }
      );
    }

    const result = await submitInvoiceToZatca({
      settings,
      invoiceKind: body.invoiceKind || settings.invoice_kind || 'simplified',
      uuid: body.uuid,
      invoiceHash: body.invoiceHash,
      invoiceXml: body.invoiceXml,
    });

    return NextResponse.json(
      {
        ...result,
        actorUserId: gate.session.userId,
      },
      { status: result.ok ? 200 : 400 }
    );
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
