import { NextResponse } from 'next/server';
import { submitInvoiceToZatca } from '@/lib/zatca/api-client';
import { loadZatcaSettings } from '@/lib/zatca/settings';
import type { ZatcaInvoiceKind, ZatcaSettings } from '@/lib/zatca/types';
import { assertLiveOrDemoAllowed } from '@/lib/runtime/mode';
import { withTenantApi } from '@/lib/tenant/api-guard';

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
  const gated = await withTenantApi(request, { module: 'finance_zatca' });
  if ('response' in gated) return gated.response;

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

    // Load ZATCA credentials for the authenticated tenant only — never from client body secrets
    const serverSettings = await loadZatcaSettings(gated.ctx.tenantId);
    const settings: ZatcaSettings = {
      ...serverSettings,
      invoice_kind: body.invoiceKind || body.settings?.invoice_kind || serverSettings.invoice_kind,
      environment: body.settings?.environment || serverSettings.environment,
      // Strip any client-supplied secrets even if present on Partial<ZatcaSettings>
      csid: serverSettings.csid,
      secret: serverSettings.secret,
      private_key_pem: serverSettings.private_key_pem,
      certificate_pem: serverSettings.certificate_pem,
      otp: serverSettings.otp,
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
        actorUserId: gated.ctx.session.userId,
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
