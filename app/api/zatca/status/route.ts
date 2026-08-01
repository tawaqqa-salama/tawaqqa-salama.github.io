import { NextResponse } from 'next/server';
import { supabase, isDemoMode } from '@/lib/supabase';
import { loadLocalZatcaSettings } from '@/lib/zatca/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const invoiceNumber = searchParams.get('invoiceNumber');
  const uuid = searchParams.get('uuid');

  if (isDemoMode) {
    return NextResponse.json({
      ok: true,
      demo: true,
      settingsEnabled: loadLocalZatcaSettings().enabled,
      invoice: null,
    });
  }

  let query = supabase.from('zatca_invoices').select('*').order('created_at', { ascending: false }).limit(1);
  if (invoiceNumber) query = query.eq('invoice_number', invoiceNumber);
  if (uuid) query = query.eq('uuid', uuid);

  const { data, error } = await query.maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, invoice: data });
}
