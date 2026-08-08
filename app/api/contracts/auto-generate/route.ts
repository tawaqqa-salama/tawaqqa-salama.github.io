import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createContractFromQuotation } from '@/lib/business/contract-service';
import type { ClientRecord } from '@/lib/types/client';
import { assertTenantRow } from '@/lib/tenant/context';
import { withTenantApi, tenantErrorResponse } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  clientId?: string;
  force?: boolean;
};

export async function POST(request: Request) {
  try {
    const gated = await withTenantApi(request);
    if ('response' in gated) return gated.response;
    const { ctx } = gated;

    const body = (await request.json()) as Body;
    if (!body.clientId) {
      return NextResponse.json({ ok: false, error: 'clientId required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', body.clientId)
      .eq('company_id', ctx.tenantId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message || 'Client not found' }, { status: 404 });
    }

    assertTenantRow(ctx, (data as { company_id?: string }).company_id, 'client');

    const result = await createContractFromQuotation(data as ClientRecord, { force: Boolean(body.force) });
    return NextResponse.json(
      {
        ok: !result.error,
        created: result.created,
        contract: result.contract,
        messages: result.messages,
        error: result.error,
      },
      { status: result.error ? 400 : 200 }
    );
  } catch (error) {
    return tenantErrorResponse(error);
  }
}
