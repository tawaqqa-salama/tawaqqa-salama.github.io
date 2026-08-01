import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createContractFromQuotation } from '@/lib/business/contract-service';
import type { ClientRecord } from '@/lib/types/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  clientId?: string;
  force?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if (!body.clientId) {
      return NextResponse.json({ ok: false, error: 'clientId مطلوب' }, { status: 400 });
    }

    const { data, error } = await supabase.from('clients').select('*').eq('id', body.clientId).maybeSingle();
    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message || 'العميل غير موجود' }, { status: 404 });
    }

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
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
