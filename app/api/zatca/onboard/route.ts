import { NextResponse } from 'next/server';
import { requestComplianceCsid, requestProductionCsid } from '@/lib/zatca/api-client';
import type { ZatcaEnvironment, ZatcaSettings } from '@/lib/zatca/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  mode?: 'compliance' | 'production';
  csr?: string;
  otp?: string;
  environment?: ZatcaEnvironment;
  settings?: Partial<ZatcaSettings>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const mode = body.mode || 'compliance';
    const environment = body.environment || body.settings?.environment || 'sandbox';

    if (mode === 'production') {
      const settings = {
        ...(body.settings || {}),
        environment,
        csid: body.settings?.csid || '',
        secret: body.settings?.secret || '',
        compliance_request_id: body.settings?.compliance_request_id || '',
      } as ZatcaSettings;

      const result = await requestProductionCsid(settings);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (!body.csr || !body.otp) {
      return NextResponse.json(
        { ok: false, error: 'يلزم إرسال CSR و OTP من منصة فاتورة' },
        { status: 400 }
      );
    }

    const result = await requestComplianceCsid({
      csr: body.csr,
      otp: body.otp,
      environment,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'خطأ غير متوقع في Onboarding',
      },
      { status: 500 }
    );
  }
}
